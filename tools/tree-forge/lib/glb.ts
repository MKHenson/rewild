// A minimal glTF 2.0 binary writer. Hand rolled rather than pulled from a
// library because the whole point of this tool is control over COLOR_0 and the
// two-material split, and because the engine's importer reads a narrow, known
// subset.
//
// TANGENT is deliberately not written: GltfLoader derives tangents for any
// primitive carrying UVs and normals, so shipping them costs 16 bytes a vertex
// for a value the importer would compute anyway.

import type { MeshAttributes } from './mesh.ts';

const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const FLOAT = 5126;
const UNSIGNED_INT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

type AccessorType = 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4';

const COMPONENTS: Record<AccessorType, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** The accessor component types this writer emits. Both are four bytes wide,
 *  which is what lets one alignment rule cover every bufferView. */
type ComponentType = typeof FLOAT | typeof UNSIGNED_INT;

interface GltfBufferView {
  buffer: number;
  byteOffset: number;
  byteLength: number;
  target?: number;
}

interface GltfAccessor {
  bufferView: number;
  componentType: ComponentType;
  count: number;
  type: AccessorType;
  min?: number[];
  max?: number[];
}

interface GltfTextureRef {
  index: number;
}

interface GltfMaterial {
  name: string;
  pbrMetallicRoughness: {
    baseColorTexture: GltfTextureRef;
    metallicRoughnessTexture: GltfTextureRef;
    metallicFactor: number;
    roughnessFactor: number;
  };
  normalTexture: GltfTextureRef;
  occlusionTexture: GltfTextureRef;
  alphaMode: 'OPAQUE' | 'MASK' | 'BLEND';
  alphaCutoff?: number;
  doubleSided: boolean;
}

interface GltfPrimitive {
  attributes: {
    POSITION: number;
    NORMAL: number;
    TEXCOORD_0: number;
    COLOR_0: number;
  };
  indices: number;
  material: number;
}

interface Gltf {
  asset: { version: string; generator: string };
  scene: number;
  scenes: { nodes: number[] }[];
  nodes: { name: string; mesh: number }[];
  meshes: { name: string; primitives: GltfPrimitive[] }[];
  materials: GltfMaterial[];
  textures: { sampler: number; source: number }[];
  images: { uri: string }[];
  samplers: { magFilter: number; minFilter: number; wrapS: number; wrapT: number }[];
  accessors: GltfAccessor[];
  bufferViews: GltfBufferView[];
  buffers: { byteLength: number }[];
}

/** The sibling image files one material references, by role. */
export interface GlbTextures {
  baseColor: string;
  normal: string;
  arm: string;
}

/** A tree's two materials draw from two images — see the header of atlas.ts. */
export interface GlbTextureSet {
  bark: GlbTextures;
  leaves: GlbTextures;
}

export interface GlbRequest {
  name: string;
  bark: MeshAttributes;
  leaves: MeshAttributes;
  textures: GlbTextureSet;
  alphaCutoff: number;
}

class BufferBuilder {
  readonly views: GltfBufferView[] = [];
  private readonly blocks: Buffer[] = [];
  private byteLength = 0;

  add(array: Float32Array | Uint32Array, target: number): number {
    // glTF requires a bufferView's offset to be a multiple of its component
    // size. Every accessor here is 4 bytes wide, so one alignment covers all.
    const padding = (4 - (this.byteLength % 4)) % 4;
    if (padding) {
      this.blocks.push(Buffer.alloc(padding));
      this.byteLength += padding;
    }

    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    this.views.push({ buffer: 0, byteOffset: this.byteLength, byteLength: bytes.byteLength, target });
    this.blocks.push(bytes);
    this.byteLength += bytes.byteLength;

    return this.views.length - 1;
  }

  concat(): Buffer {
    return Buffer.concat(this.blocks, this.byteLength);
  }
}

function minMax(array: Float32Array | Uint32Array, components: number) {
  const min = new Array<number>(components).fill(Infinity);
  const max = new Array<number>(components).fill(-Infinity);

  for (let i = 0; i < array.length; i += components)
    for (let c = 0; c < components; c++) {
      const value = array[i + c];
      if (value < min[c]) min[c] = value;
      if (value > max[c]) max[c] = value;
    }

  return { min, max };
}

function addAccessor(
  gltf: Gltf,
  buffers: BufferBuilder,
  array: Float32Array | Uint32Array,
  type: AccessorType,
  componentType: ComponentType,
  target: number,
  withBounds: boolean
): number {
  const components = COMPONENTS[type];
  const accessor: GltfAccessor = {
    bufferView: buffers.add(array, target),
    componentType,
    count: array.length / components,
    type,
  };

  // POSITION is the one accessor the spec insists carries bounds, because
  // viewers frame the model from them.
  if (withBounds) Object.assign(accessor, minMax(array, components));

  gltf.accessors.push(accessor);
  return gltf.accessors.length - 1;
}

function addPrimitive(
  gltf: Gltf,
  buffers: BufferBuilder,
  attributes: MeshAttributes,
  material: number
): GltfPrimitive {
  return {
    attributes: {
      POSITION: addAccessor(gltf, buffers, attributes.positions, 'VEC3', FLOAT, ARRAY_BUFFER, true),
      NORMAL: addAccessor(gltf, buffers, attributes.normals, 'VEC3', FLOAT, ARRAY_BUFFER, false),
      TEXCOORD_0: addAccessor(gltf, buffers, attributes.uvs, 'VEC2', FLOAT, ARRAY_BUFFER, false),
      COLOR_0: addAccessor(gltf, buffers, attributes.colors, 'VEC4', FLOAT, ARRAY_BUFFER, false),
    },
    indices: addAccessor(gltf, buffers, attributes.indices, 'SCALAR', UNSIGNED_INT, ELEMENT_ARRAY_BUFFER, false),
    material,
  };
}

/**
 * `textures` names the sibling image files by role. They are referenced by URI
 * rather than embedded so that every variant sharing a texture set also shares
 * one fetch, one decode and one GPU texture — the importer keys an external
 * image by its absolute url.
 */
export function writeGlb({ name, bark, leaves, textures, alphaCutoff }: GlbRequest): Buffer {
  const buffers = new BufferBuilder();

  const gltf: Gltf = {
    asset: { version: '2.0', generator: 'tree-forge' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives: [] }],
    materials: [],
    textures: [],
    images: [],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };

  /** Registers one material's three images and returns the slots it draws from. */
  function bind(set: GlbTextures) {
    const slot = (uri: string): number => {
      gltf.images.push({ uri });
      gltf.textures.push({ sampler: 0, source: gltf.images.length - 1 });
      return gltf.textures.length - 1;
    };

    const baseColor = slot(set.baseColor);
    const normal = slot(set.normal);
    const arm = slot(set.arm);

    return {
      pbrMetallicRoughness: {
        baseColorTexture: { index: baseColor },
        // Roughness in G and metallic in B, the same packed ARM map the
        // occlusion slot reads R from. glTF models these as two slots precisely
        // so one image can serve both.
        metallicRoughnessTexture: { index: arm },
        metallicFactor: 1,
        roughnessFactor: 1,
      },
      normalTexture: { index: normal },
      occlusionTexture: { index: arm },
    };
  }

  gltf.materials.push({
    name: `${name}-bark`,
    ...bind(textures.bark),
    alphaMode: 'OPAQUE',
    doubleSided: false,
  });

  gltf.materials.push({
    name: `${name}-leaves`,
    ...bind(textures.leaves),
    // Cutout, never blend: an alpha-tested fragment either writes depth or does
    // not exist, so leaves sort against each other with no per-instance sort.
    alphaMode: 'MASK',
    alphaCutoff,
    doubleSided: true,
  });

  const primitives = gltf.meshes[0].primitives;
  if (bark.vertexCount) primitives.push(addPrimitive(gltf, buffers, bark, 0));
  if (leaves.vertexCount) primitives.push(addPrimitive(gltf, buffers, leaves, 1));

  const bin = buffers.concat();
  gltf.bufferViews = buffers.views;
  gltf.buffers.push({ byteLength: bin.byteLength });

  return pack(gltf, bin);
}

function pack(gltf: Gltf, bin: Buffer): Buffer {
  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPadding = (4 - (json.byteLength % 4)) % 4;
  const binPadding = (4 - (bin.byteLength % 4)) % 4;

  const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPadding, 0)]);

  const total = 12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength;
  const out = Buffer.alloc(total);

  out.writeUInt32LE(MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.byteLength, 12);
  out.writeUInt32LE(JSON_CHUNK, 16);
  jsonChunk.copy(out, 20);

  const binHeader = 20 + jsonChunk.byteLength;
  out.writeUInt32LE(binChunk.byteLength, binHeader);
  out.writeUInt32LE(BIN_CHUNK, binHeader + 4);
  binChunk.copy(out, binHeader + 8);

  return out;
}
