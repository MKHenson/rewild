import type {
  GLTFMaterialPostprocessed,
  GLTFPostprocessed,
} from '@loaders.gl/gltf';
import { ALPHA_MODES, AlphaMode } from '../materials/uniforms/StandardMaterial';
import { samplerKey } from '../managers/SamplerManager';
import { IStandardMaterialTemplate, TemplateColor } from '../managers/types';
import { DEFAULT_SAMPLER, GltfMaterialTextures } from './GltfTextures';
import { hashString } from '../utils/hash';

/**
 * A glTF material as the engine's own material template, plus what is needed to
 * bind it back to the file it came from.
 */
export interface GltfMaterialTemplate extends IStandardMaterialTemplate {
  /** The glTF material's own id, which joins primitives to templates within a
   *  file. Not part of the material's identity — see `materialKey`. */
  gltfId: string;
  gltfName: string | null;
  sampler: GPUSamplerDescriptor;
}

const GLTF_DEFAULT_METALLIC = 1;
const GLTF_DEFAULT_ROUGHNESS = 1;
export const DEFAULT_MATERIAL_ID = 'gltf-default-material';

function toColor(value: number[] | undefined, fallback: TemplateColor) {
  return value ? ([value[0], value[1], value[2]] as TemplateColor) : fallback;
}

function toAlphaMode(mode: string | undefined, name: string): AlphaMode {
  if (mode === undefined) return 'OPAQUE';
  if ((ALPHA_MODES as readonly string[]).includes(mode))
    return mode as AlphaMode;

  console.warn(
    `glTF material "${name}": unknown alphaMode "${mode}" — treating it as OPAQUE`
  );
  return 'OPAQUE';
}

/**
 * The material's identity: everything that decides what it draws, hashed.
 *
 * Deliberately *not* the glTF material's name. Blender names most materials
 * `Material.001`, so two unrelated models would collide on a name and five
 * models exported from five files would fail to share one. Hashing what the
 * material does gets both cases right: same look, same pass; different look,
 * different pass — however the author happened to name them.
 */
function materialKey(
  template: Omit<GltfMaterialTemplate, 'name' | 'gltfId' | 'gltfName'>
): string {
  const { sampler, ...fields } = template;
  // The fields are written in a fixed order below, so stringify is stable.
  return `gltf-mat:${hashString(
    `${JSON.stringify(fields)}|${samplerKey(sampler)}`
  )}`;
}

function toTemplate(
  material: GLTFMaterialPostprocessed | null,
  textures: GltfMaterialTextures | undefined
): GltfMaterialTemplate {
  const gltfName = material?.name ?? null;
  const name = gltfName ?? material?.id ?? 'default';
  const pbr = material?.pbrMetallicRoughness;
  const baseColor = pbr?.baseColorFactor;

  const fields = {
    type: 'standard' as const,
    baseColorMap: textures?.baseColorMap,
    normalMap: textures?.normalMap,
    metallicRoughnessMap: textures?.metallicRoughnessMap,
    occlusionMap: textures?.occlusionMap,
    emissiveMap: textures?.emissiveMap,
    // glTF carries opacity in baseColorFactor's fourth component; this schema
    // splits it out under the name its other material types already use.
    baseColorFactor: toColor(baseColor, [1, 1, 1]),
    opacity: baseColor?.[3] ?? 1,
    metallic: pbr?.metallicFactor ?? GLTF_DEFAULT_METALLIC,
    roughness: pbr?.roughnessFactor ?? GLTF_DEFAULT_ROUGHNESS,
    emissiveColor: toColor(material?.emissiveFactor, [0, 0, 0]),
    // KHR_materials_emissive_strength is the only way to author emission past
    // 1, and loaders.gl passes it through untouched.
    emissiveStrength:
      material?.extensions?.KHR_materials_emissive_strength?.emissiveStrength ??
      1,
    occlusionStrength: material?.occlusionTexture?.strength ?? 1,
    normalScale: material?.normalTexture?.scale ?? 1,
    alphaMode: toAlphaMode(material?.alphaMode, name),
    alphaCutoff: material?.alphaCutoff ?? 0.5,
    doubleSided: material?.doubleSided ?? false,
    // A normal map is authored against a tangent frame, and the importer
    // supplies one for every primitive that could carry it.
    vertexTangents: !!textures?.normalMap,
    // Never inferred from COLOR_0's presence: foliage carries bend weights in
    // that attribute, and tinting by them would be wrong on every leaf.
    vertexColors: false,
    sampler: textures?.sampler ?? DEFAULT_SAMPLER,
  };

  return {
    ...fields,
    name: materialKey(fields),
    gltfId: material?.id ?? DEFAULT_MATERIAL_ID,
    gltfName,
  };
}

/**
 * Turns a file's material definitions into engine material templates, plus
 * glTF's own default material for primitives that declare none.
 */
export function toMaterialTemplates(
  gltf: GLTFPostprocessed,
  textures: GltfMaterialTextures[]
): GltfMaterialTemplate[] {
  const texturesById = new Map(textures.map((entry) => [entry.id, entry]));

  const templates = (gltf.materials ?? []).map((material) =>
    toTemplate(material, texturesById.get(material.id))
  );
  templates.push(toTemplate(null, undefined));

  return templates;
}

/** Looks up the key a primitive's material resolves to. */
export function materialKeysById(
  templates: GltfMaterialTemplate[]
): Map<string, string> {
  return new Map(templates.map((template) => [template.gltfId, template.name]));
}
