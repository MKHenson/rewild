import type {
  GLTFMaterialPostprocessed,
  GLTFPostprocessed,
  GLTFTexturePostprocessed,
} from '@loaders.gl/gltf';
import { TextureColorSpace } from '../textures/Texture';
import { hashBytes } from '../utils/hash';

// The postprocessed sampler type is not exported from the package's barrel.
type GltfSampler = NonNullable<GLTFTexturePostprocessed['sampler']>;

// glTF samplers use GL's enum values verbatim. Naming them beats leaving 9987
// in a switch.
const GL_NEAREST = 9728;
const GL_LINEAR = 9729;
const GL_NEAREST_MIPMAP_NEAREST = 9984;
const GL_LINEAR_MIPMAP_NEAREST = 9985;
const GL_NEAREST_MIPMAP_LINEAR = 9986;
const GL_LINEAR_MIPMAP_LINEAR = 9987;
const GL_CLAMP_TO_EDGE = 33071;
const GL_MIRRORED_REPEAT = 33648;

/** glTF's own default: repeat, and "let the implementation choose" filtering. */
export const DEFAULT_SAMPLER: GPUSamplerDescriptor = {
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
  addressModeU: 'repeat',
  addressModeV: 'repeat',
};

/**
 * One image the model needs, in the form the texture manager can build it from.
 *
 * `key` is both the manager's id and the identity used to decide two references
 * are the same image — see `textureKey`.
 */
export interface GltfTextureRequest {
  key: string;
  colorSpace: TextureColorSpace;
  /** Set for an image stored as a sibling file. */
  url?: string;
  /** Set for an image embedded in the GLB, or inline as a data URI. */
  bytes?: Uint8Array;
  mimeType?: string;
}

/**
 * A glTF material reduced to the textures it binds, by texture-manager key.
 */
export interface GltfMaterialTextures {
  /** The glTF material's own id, stable within the file. Joins back to the
   *  primitives that reference it. */
  id: string;
  name: string | null;
  baseColorMap?: string;
  normalMap?: string;
  metallicRoughnessMap?: string;
  occlusionMap?: string;
  emissiveMap?: string;
  /**
   * One sampler for the whole material, taken from its base colour texture.
   */
  sampler: GPUSamplerDescriptor;
}

export interface GltfTextureSet {
  textures: GltfTextureRequest[];
  materials: GltfMaterialTextures[];
}

/**
 * Colour space is decided by the *slot*, never by the file name or its
 * contents: the same PNG is colour in one material and data in another, and
 * only the material knows which. Lichen requires every texture to declare a
 * space with no default, and glTF's slot semantics are that declaration.
 */
const SRGB_SLOTS: readonly string[] = ['baseColorMap', 'emissiveMap'];

/**
 * Two references name the same texture when they resolve to the same bytes
 * *and* the same colour space. The space belongs in the key because WebGPU
 * makes sRGB a property of the format: one image used as albedo in one material
 * and as an ORM map in another is genuinely two GPU textures.
 */
function textureKey(identity: string, colorSpace: TextureColorSpace): string {
  return `gltf:${identity}#${colorSpace}`;
}

/** Percent-encoded data URIs are legal and never used for images; null asks the
 *  caller to warn rather than guess. */
function decodeDataUri(
  uri: string
): { bytes: Uint8Array; mimeType?: string } | null {
  const comma = uri.indexOf(',');
  if (comma === -1) return null;

  const header = uri.slice('data:'.length, comma);
  if (!header.endsWith(';base64')) return null;

  const binary = atob(uri.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return {
    bytes,
    mimeType: header.slice(0, -';base64'.length) || undefined,
  };
}

function toMinFilter(minFilter?: number): {
  minFilter: GPUFilterMode;
  mipmapFilter: GPUMipmapFilterMode;
} {
  switch (minFilter) {
    case GL_NEAREST:
    case GL_NEAREST_MIPMAP_NEAREST:
      return { minFilter: 'nearest', mipmapFilter: 'nearest' };
    case GL_NEAREST_MIPMAP_LINEAR:
      return { minFilter: 'nearest', mipmapFilter: 'linear' };
    // GL_LINEAR asks for no mip filtering at all, which WebGPU cannot express
    // on a texture that has mips — nearest is as close as it gets.
    case GL_LINEAR:
    case GL_LINEAR_MIPMAP_NEAREST:
      return { minFilter: 'linear', mipmapFilter: 'nearest' };
    case GL_LINEAR_MIPMAP_LINEAR:
    default:
      return { minFilter: 'linear', mipmapFilter: 'linear' };
  }
}

function toAddressMode(wrap?: number): GPUAddressMode {
  switch (wrap) {
    case GL_CLAMP_TO_EDGE:
      return 'clamp-to-edge';
    case GL_MIRRORED_REPEAT:
      return 'mirror-repeat';
    default:
      return 'repeat';
  }
}

function toSamplerDescriptor(sampler?: GltfSampler): GPUSamplerDescriptor {
  if (!sampler) return DEFAULT_SAMPLER;

  return {
    magFilter: sampler.magFilter === GL_NEAREST ? 'nearest' : 'linear',
    ...toMinFilter(sampler.minFilter),
    addressModeU: toAddressMode(sampler.wrapS),
    addressModeV: toAddressMode(sampler.wrapT),
  };
}

/** What a slot's reference looks like across glTF's three texture-info types,
 *  which differ only in the extras they carry. */
interface TextureInfo {
  texture?: GLTFTexturePostprocessed;
  texCoord?: number;
}

/**
 * Resolves one slot to a texture key, recording the request the first time an
 * image is seen. Returns undefined for anything unusable, having said why — the
 * material then falls back to the standard material's white default, which is a
 * far better failure than refusing to load the model.
 */
function resolveSlot(
  info: TextureInfo | undefined,
  colorSpace: TextureColorSpace,
  materialName: string,
  baseUrl: string | undefined,
  requests: Map<string, GltfTextureRequest>
): string | undefined {
  if (!info) return undefined;

  // EXT_texture_webp moves the source into an extension; loaders.gl folds it
  // back before postprocessing, but only where the browser reports webp
  // support. Anywhere it does not, the reference is simply unresolved.
  const image = info.texture?.source;
  if (!image) {
    console.warn(
      `glTF material "${materialName}": a texture has no readable image source`
    );
    return undefined;
  }

  // The engine's geometry carries one UV set, so a second one would silently
  // sample the first. Worth saying out loud rather than shipping wrong UVs.
  if (info.texCoord)
    console.warn(
      `glTF material "${materialName}": TEXCOORD_${info.texCoord} is not ` +
        `supported — sampling TEXCOORD_0 instead`
    );

  let identity: string;
  let source: Omit<GltfTextureRequest, 'key' | 'colorSpace'>;

  if (image.bufferView?.data) {
    // Embedded in the GLB. The bytes are still encoded PNG/JPEG/WebP; nothing
    // has decoded them, which is exactly what makes them hashable.
    identity = hashBytes(image.bufferView.data);
    source = { bytes: image.bufferView.data, mimeType: image.mimeType };
  } else if (image.uri?.startsWith('data:')) {
    const decoded = decodeDataUri(image.uri);
    if (!decoded) {
      console.warn(
        `glTF material "${materialName}": image data URI is not base64-encoded`
      );
      return undefined;
    }
    identity = hashBytes(decoded.bytes);
    source = { bytes: decoded.bytes, mimeType: decoded.mimeType };
  } else if (image.uri) {
    // A sibling file. The absolute URL is the identity, so every model
    // referencing it shares one fetch, one decode and one GPU texture — the
    // reason to export a shared material with external images.
    identity = baseUrl ? new URL(image.uri, baseUrl).href : image.uri;
    source = { url: identity };
  } else {
    console.warn(
      `glTF material "${materialName}": image has neither a uri nor data`
    );
    return undefined;
  }

  const key = textureKey(identity, colorSpace);
  if (!requests.has(key)) requests.set(key, { key, colorSpace, ...source });

  return key;
}

function collectMaterial(
  material: GLTFMaterialPostprocessed,
  baseUrl: string | undefined,
  requests: Map<string, GltfTextureRequest>
): GltfMaterialTextures {
  const name = material.name ?? material.id;
  const pbr = material.pbrMetallicRoughness;

  const slot = (info: TextureInfo | undefined, slotName: string) =>
    resolveSlot(
      info,
      SRGB_SLOTS.includes(slotName) ? 'srgb' : 'linear',
      name,
      baseUrl,
      requests
    );

  return {
    id: material.id,
    name: material.name ?? null,
    baseColorMap: slot(pbr?.baseColorTexture, 'baseColorMap'),
    normalMap: slot(material.normalTexture, 'normalMap'),
    metallicRoughnessMap: slot(
      pbr?.metallicRoughnessTexture,
      'metallicRoughnessMap'
    ),
    occlusionMap: slot(material.occlusionTexture, 'occlusionMap'),
    emissiveMap: slot(material.emissiveTexture, 'emissiveMap'),
    sampler: toSamplerDescriptor(pbr?.baseColorTexture?.texture?.sampler),
  };
}

/**
 * Reads every texture the file's materials bind, and what each material binds
 * where.
 *
 * Images are deliberately *not* decoded by the glTF loader (`loadImages` is
 * off), for two reasons: the encoded bytes are what identifies an image, and
 * decoding them there would bypass the engine's own ImageLoader — its
 * concurrency gate, its retries and its uncolour-managed decode.
 *
 * `baseUrl` is the model's own URL, used to resolve relative image URIs. It is
 * optional so the walk can be exercised against a structure rather than a file.
 */
export function collectGltfTextures(
  gltf: GLTFPostprocessed,
  baseUrl?: string
): GltfTextureSet {
  const requests = new Map<string, GltfTextureRequest>();
  const materials = (gltf.materials ?? []).map((material) =>
    collectMaterial(material, baseUrl, requests)
  );

  return { textures: Array.from(requests.values()), materials };
}
