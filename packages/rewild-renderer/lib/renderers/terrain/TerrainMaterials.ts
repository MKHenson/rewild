// The terrain material library — named texture sets that biomes surface with.
//
// Materials are game content, designed in code like the climate presets: a
// world never persists these tables, only which climate preset it uses. Biomes
// reference materials by name (see `BiomeLayer` in Biomes.ts) and the splat map
// stores one weight per material.
//
// All of a material's textures are bound as a single `texture_2d_array`,
// so every material must share resolution and format. They are 1024² today, and
// should stay there: a 4K layer costs ~85 MiB of VRAM against ~5 MiB at 1K —
// eight of those is most of a gigabyte — to carry detail that mips away to flat
// grey past a few metres anyway. That mip-flattening is exactly what the macro
// normal below exists to counteract.

export interface TerrainMaterial {
  name: string;
  // textureManager keys (templates/materials.json).
  albedo: string;
  normal: string;
  // Detail tiling, in tiles per chunk UV unit.
  uvScale: number;
  // Large-scale normal for distant fragments, sampled at `macroUvScale`.
  //
  // Distant terrain looks washed out because a normal map's mips average toward
  // flat (0,0,1) — the GPU deletes the detail. A macro normal's features stay
  // many pixels wide at range, so mipping cannot erase them, and the detail
  // normal is faded out by view distance underneath it (#181). Omitted ⇒ this
  // material has no macro normal and simply fades toward its geometric normal.
  macroNormal?: string;
  macroUvScale?: number;
  // Scalar specular modulator, replacing the per-texel specular map — that map
  // is bound to `white-1x1` today, so it costs two texture samples per layer to
  // multiply by 1.0.
  specular: number;
}

// Matches the shader's current `fragUV * 25.0`, so the detail tiling of the
// existing single-material terrain carries over unchanged.
const DETAIL_UV_SCALE = 25;

// Much coarser than the detail scale: features spanning metres rather than
// centimetres, which is what survives mipping at distance.
const MACRO_UV_SCALE = 2;

export const TERRAIN_MATERIALS: Record<string, TerrainMaterial> = {
  'forest-ground-01': {
    name: 'forest-ground-01',
    albedo: 'forest-ground-01',
    normal: 'forest-ground-01-normal',
    uvScale: DETAIL_UV_SCALE,
    specular: 0.12,
  },
  'ground-coastal-1': {
    name: 'ground-coastal-1',
    albedo: 'ground-coastal-1',
    normal: 'ground-coastal-1-normal',
    uvScale: DETAIL_UV_SCALE,
    specular: 0.18,
  },
  // The only material that reads at silhouette distance, so it is the one that
  // gets a macro normal — reusing its own detail normal at a much larger scale
  // rather than a purpose-authored macro map. Cheap, tunable, and enough to
  // tell whether the technique earns a dedicated asset.
  'rocks-ground-01': {
    name: 'rocks-ground-01',
    albedo: 'rocks-ground-01',
    normal: 'rocks-ground-01-normal',
    uvScale: DETAIL_UV_SCALE,
    macroNormal: 'rocks-ground-01-normal',
    macroUvScale: MACRO_UV_SCALE,
    specular: 0.3,
  },
  'snow-02': {
    name: 'snow-02',
    albedo: 'snow-02',
    normal: 'snow-02-normal',
    uvScale: DETAIL_UV_SCALE,
    specular: 0.55,
  },
};

// Throws rather than falling back: unlike a climate preset id (which a saved
// world can carry from a renamed preset, and so degrades gracefully), a
// material name only ever comes from a table in this repo. A miss is a typo.
export function getTerrainMaterial(name: string): TerrainMaterial {
  const material = TERRAIN_MATERIALS[name];
  if (!material) throw new Error(`Unknown terrain material '${name}'.`);
  return material;
}
