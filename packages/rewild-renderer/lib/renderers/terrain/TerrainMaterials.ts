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
  // Bucket-relative texture URLs, resolved against SHARED_ASSETS_BASE_URL.
  //
  // Deliberately URLs rather than materials.json keys: these textures are only
  // ever sampled through the terrain arrays, so routing them via the shared
  // template would load each one a second time as a standalone texture — ~43
  // MiB of VRAM nothing binds. The table describes the material completely.
  albedoUrl: string;
  normalUrl: string;
  // Detail tiling, in tiles per chunk UV unit.
  uvScale: number;
  // Large-scale normal for distant fragments, sampled at `macroUvScale`.
  //
  // Distant terrain looks washed out because a normal map's mips average toward
  // flat (0,0,1) — the GPU deletes the detail. A macro normal's features stay
  // many pixels wide at range, so mipping cannot erase them, and the detail
  // normal is faded out by view distance underneath it (#181). Omitted ⇒ this
  // material has no macro normal and simply fades toward its geometric normal.
  //
  // Must currently be the material's own `normalUrl` — see
  // validateTerrainMaterials for why.
  macroNormalUrl?: string;
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

const ROCK_NORMAL_URL = 'terrain/rocks-ground-01/rocks_ground_01_norm_1k.png';

export const TERRAIN_MATERIALS: Record<string, TerrainMaterial> = {
  'forest-ground-01': {
    name: 'forest-ground-01',
    albedoUrl: 'terrain/forest-ground-01/forrest_ground_01_diff_1k.jpg',
    normalUrl: 'terrain/forest-ground-01/forrest_ground_01_norm_1k.png',
    uvScale: DETAIL_UV_SCALE,
    specular: 0.12,
  },
  'ground-coastal-1': {
    name: 'ground-coastal-1',
    albedoUrl:
      'terrain/ground-coastal-1/TexturesCom_Ground_Coastal1_2x2_1K_albedo.png',
    normalUrl:
      'terrain/ground-coastal-1/TexturesCom_Ground_Coastal1_2x2_1K_normal.png',
    uvScale: DETAIL_UV_SCALE,
    specular: 0.18,
  },
  // The only material that reads at silhouette distance, so it is the one that
  // gets a macro normal — reusing its own detail normal at a much larger scale
  // rather than a purpose-authored macro map. Cheap, tunable, and enough to
  // tell whether the technique earns a dedicated asset.
  'rocks-ground-01': {
    name: 'rocks-ground-01',
    albedoUrl: 'terrain/rocks-ground-01/rocks_ground_01_diff_1k.jpg',
    normalUrl: ROCK_NORMAL_URL,
    uvScale: DETAIL_UV_SCALE,
    macroNormalUrl: ROCK_NORMAL_URL,
    macroUvScale: MACRO_UV_SCALE,
    specular: 0.3,
  },
  'snow-02': {
    name: 'snow-02',
    albedoUrl: 'terrain/snow-02/snow_02_diff_1k.jpg',
    normalUrl: 'terrain/snow-02/snow_02_norm_1k.png',
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

// The terrain texture arrays' layer order: array layer i holds this list's i-th
// material. Covers the whole library and is independent of any one climate's
// palette — a climate maps its splat channel to a layer index here, which is
// the indirection the shader performs. Declaration order, so adding a material
// appends a layer.
export function getTerrainMaterialOrder(): string[] {
  return Object.keys(TERRAIN_MATERIALS);
}

// The texture-array layer a material occupies, or -1 if it isn't in the library.
export function getTerrainMaterialLayer(name: string): number {
  return getTerrainMaterialOrder().indexOf(name);
}

// Guards the invariants the array loader depends on. Called before the arrays
// are built, so a mis-authored table fails at startup rather than rendering
// something subtly wrong.
export function validateTerrainMaterials(): void {
  for (const material of Object.values(TERRAIN_MATERIALS)) {
    if (!!material.macroNormalUrl !== (material.macroUvScale !== undefined))
      throw new Error(
        `Terrain material '${material.name}' must set macroNormalUrl and macroUvScale together.`
      );

    if (
      material.macroUvScale !== undefined &&
      material.macroUvScale >= material.uvScale
    )
      throw new Error(
        `Terrain material '${material.name}' has macroUvScale ${material.macroUvScale} >= uvScale ${material.uvScale} — a macro normal must be coarser than the detail normal or it buys nothing.`
      );

    // Only albedo and normal arrays are built, so the macro normal is the
    // material's own normal array layer sampled at macroUvScale. A macro map
    // that is a *different* texture would need a third array — deliberately not
    // built for one material that currently reuses its own normal.
    if (material.macroNormalUrl && material.macroNormalUrl !== material.normalUrl)
      throw new Error(
        `Terrain material '${material.name}' macroNormalUrl must be its own normalUrl — a distinct macro map needs a third texture array, which does not exist yet.`
      );
  }
}
