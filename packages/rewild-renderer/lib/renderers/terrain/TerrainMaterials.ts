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
  albedoUrl: string;
  normalUrl: string;
  // Roughness (G), metallic (B) and occlusion (R)
  armUrl: string;
  heightUrl: string;
  heightScale: number;
  uvScale: number;
  macroUvScale?: number;
  // Which material's normal map to use as this one's macro normal. Omitted ⇒ its
  // own, which is the historical behaviour.
  macroNormalFrom?: string;
  // How much of the macro normal to apply, 0 (flat) to 1 (the map's full tilt).
  // Omitted ⇒ 1.
  macroStrength?: number;
  roughness: number;
  occlusionStrength?: number;
  // How softly this material hands over to its neighbours, in blend-score units
  // (score = splat weight + centred surface height). Only layers within this of
  // the winning score contribute, so it is the *width of the transition*.
  //
  // The scale to judge it against is the spread of the height term. Two layers
  // at equal splat weight differ in score by their surface-height difference
  // alone, which for typical maps spans roughly ±0.4 — so:
  //
  //   ~0.2  every texel has one clear winner. A hard, interlocking edge that
  //         follows the material's own relief: rock protruding through grass
  //         along its own silhouette. Right for stone.
  //   ~0.7  the height term rarely decides anything on its own, and the splat
  //         weight carries the transition. A soft crossfade. Right for
  //         litter, sand, and anything that should intermingle rather than meet.
  blendDepth?: number;
  // Which way the normal map's green channel points. Sources differ and there
  // is no way to detect it from the file, so every material must say.
  //
  //   'opengl'  green = +Y, up the image   (Poly Haven, Blender, Substance-GL)
  //   'directx' green = -Y, down the image (Unreal, 3ds Max, many stock sites)
  //
  // Terrain's tangent frame has Y following +V, and V runs *down* the image
  // (WebGPU samples with the origin top-left), so a DirectX map binds directly
  // and an OpenGL map needs its green inverted. Get this backwards and every
  // bump on the material reads as a dent.
  normalConvention: 'opengl' | 'directx';
}

// Matches the shader's current `fragUV * 25.0`, so the detail tiling of the
// existing single-material terrain carries over unchanged.
const DETAIL_UV_SCALE = 30;

// Much coarser than the detail scale: features spanning metres rather than
// centimetres, which is what survives mipping at distance.
const MACRO_UV_SCALE = 2;

// Base parallax-occlusion depth, in tile-UV units. Rock reads deeper than
// ground and snow via the per-material multipliers below.
const HEIGHT_SCALE = 0.022;

/**
 * Base roughness factor: 1 means "the ARM map is right as authored", which is
 * where a material with no particular character should sit. Matte ground goes
 * above it, hard or wet surfaces (rock, marble, snow crust) below.
 */
const ROUGHNESS = 1;

// Default transition width — the hard, interlocking edge the height-aware blend
// was built for, and what a material without its own `blendDepth` gets.
// Materials that should intermingle override it upward; see
// TerrainMaterial.blendDepth.
export const BLEND_DEPTH = 0.2;

// Transition width for materials that mix rather than meet: wide enough that
// per-texel relief no longer decides the boundary on its own, leaving the splat
// weight to carry a soft crossfade.
const BLEND_DEPTH_SOFT = 0.7;

export const TERRAIN_MATERIALS: Record<string, TerrainMaterial> = {
  'forest-ground-01': {
    name: 'forest-ground-01',
    albedoUrl: 'terrain/forest-ground-01/forrest_ground_01_diff_1k.jpg',
    normalUrl: 'terrain/forest-ground-01/forrest_ground_01_nor_gl_1k.webp',
    armUrl: 'terrain/forest-ground-01/forrest_ground_01_arm_1k.webp',
    heightUrl: 'terrain/forest-ground-01/forrest_ground_01_disp_1k.webp',
    heightScale: HEIGHT_SCALE,
    macroUvScale: MACRO_UV_SCALE * 2,
    uvScale: DETAIL_UV_SCALE,
    roughness: ROUGHNESS * 1.17,
    blendDepth: BLEND_DEPTH_SOFT,
    normalConvention: 'opengl',
  },
  coast_sand_04: {
    name: 'coast_sand_04',
    albedoUrl: 'terrain/coast-sand-04/coast_sand_04_diff_1k.webp',
    normalUrl: 'terrain/coast-sand-04/coast_sand_04_nor_gl_1k.webp',
    armUrl: 'terrain/coast-sand-04/coast_sand_04_arm_1k.webp',
    heightUrl: 'terrain/coast-sand-04/coast_sand_04_disp_1k.webp',
    heightScale: HEIGHT_SCALE,
    uvScale: DETAIL_UV_SCALE,
    macroUvScale: MACRO_UV_SCALE,
    roughness: ROUGHNESS * 1.07,
    normalConvention: 'opengl',
  },
  'rocks-ground-01': {
    name: 'rocks-ground-01',
    albedoUrl: 'terrain/rocks-ground-01/rocks_ground_01_diff_1k.jpg',
    normalUrl: 'terrain/rocks-ground-01/rocks_ground_01_nor_gl_1k.webp',
    armUrl: 'terrain/rocks-ground-01/rocks_ground_01_arm_1k.webp',
    heightUrl: 'terrain/rocks-ground-01/rocks_ground_01_disp_1k.webp',
    heightScale: HEIGHT_SCALE * 1.8,
    uvScale: DETAIL_UV_SCALE,
    macroUvScale: MACRO_UV_SCALE,
    roughness: ROUGHNESS * 0.91,
    normalConvention: 'opengl',
  },
  'snow-02': {
    name: 'snow-02',
    albedoUrl: 'terrain/snow-02/snow_02_diff_1k.jpg',
    normalUrl: 'terrain/snow-02/snow_02_nor_gl_1k.webp',
    armUrl: 'terrain/snow-02/snow_02_arm_1k.webp',
    heightUrl: 'terrain/snow-02/snow_02_disp_1k.webp',
    macroUvScale: MACRO_UV_SCALE,
    heightScale: HEIGHT_SCALE * 0.5,
    uvScale: DETAIL_UV_SCALE * 0.25,
    roughness: ROUGHNESS * 0.55,
    normalConvention: 'opengl',
  },
  rocky_terrain: {
    name: 'rocky_terrain',
    albedoUrl: 'terrain/rocky-terrain/rocky_terrain_diff_1k.jpg',
    normalUrl: 'terrain/rocky-terrain/rocky_terrain_nor_gl_1k.webp',
    armUrl: 'terrain/rocky-terrain/rocky_terrain_arm_1k.webp',
    heightUrl: 'terrain/rocky-terrain/rocky_terrain_disp_1k.webp',
    heightScale: HEIGHT_SCALE * 1.6,
    macroUvScale: MACRO_UV_SCALE * 2,
    uvScale: DETAIL_UV_SCALE,
    roughness: ROUGHNESS * 0.91,
    normalConvention: 'opengl',
  },
  aerial_rocks_01: {
    name: 'aerial_rocks_01',
    albedoUrl: 'terrain/aerial_rocks_01/aerial_rocks_01_diff_1k.jpg',
    normalUrl: 'terrain/aerial_rocks_01/aerial_rocks_01_nor_gl_1k.webp',
    armUrl: 'terrain/aerial_rocks_01/aerial_rocks_01_arm_1k.webp',
    heightUrl: 'terrain/aerial_rocks_01/aerial_rocks_01_disp_1k.webp',
    heightScale: HEIGHT_SCALE * 1.6,
    macroUvScale: MACRO_UV_SCALE * 2,
    uvScale: DETAIL_UV_SCALE,
    roughness: ROUGHNESS * 1.55,
    normalConvention: 'opengl',
  },
  marble_cliff_05: {
    name: 'marble_cliff_05',
    albedoUrl: 'terrain/marble-cliff-05/marble_cliff_05_diff_1k.jpg',
    normalUrl: 'terrain/marble-cliff-05/marble_cliff_05_nor_gl_1k.webp',
    armUrl: 'terrain/marble-cliff-05/marble_cliff_05_arm_1k.webp',
    heightUrl: 'terrain/marble-cliff-05/marble_cliff_05_disp_1k.webp',
    heightScale: HEIGHT_SCALE * 4,
    macroUvScale: MACRO_UV_SCALE * 2,
    uvScale: DETAIL_UV_SCALE,
    roughness: ROUGHNESS * 0.8,
    normalConvention: 'opengl',
  },
  mud_cracked_dry_03: {
    name: 'mud_cracked_dry_03',
    albedoUrl: 'terrain/mud-cracked-dry-03/mud_cracked_dry_03_diff_1k.jpg',
    normalUrl: 'terrain/mud-cracked-dry-03/mud_cracked_dry_03_nor_gl_1k.webp',
    armUrl: 'terrain/mud-cracked-dry-03/mud_cracked_dry_03_arm_1k.webp',
    heightUrl: 'terrain/mud-cracked-dry-03/mud_cracked_dry_03_disp_1k.webp',
    heightScale: HEIGHT_SCALE * 1.5,
    macroUvScale: MACRO_UV_SCALE * 5,
    uvScale: DETAIL_UV_SCALE,
    blendDepth: BLEND_DEPTH_SOFT,
    roughness: ROUGHNESS * 1.07,
    normalConvention: 'opengl',
  },
  sand_01: {
    name: 'sand_01',
    albedoUrl: 'terrain/sand-01/sand_01_diff_1k.jpg',
    normalUrl: 'terrain/sand-01/sand_01_nor_gl_1k.webp',
    armUrl: 'terrain/sand-01/sand_01_arm_1k.webp',
    heightUrl: 'terrain/sand-01/sand_01_disp_1k.webp',
    heightScale: HEIGHT_SCALE * 2,
    macroUvScale: MACRO_UV_SCALE,
    uvScale: DETAIL_UV_SCALE,
    roughness: ROUGHNESS * 1.17,
    blendDepth: BLEND_DEPTH_SOFT,
    normalConvention: 'opengl',
  },
  forest_leaves_02: {
    name: 'forest_leaves_02',
    albedoUrl: 'terrain/forest-leaves-02/forest_leaves_02_diffuse_1k.jpg',
    normalUrl: 'terrain/forest-leaves-02/forest_leaves_02_nor_gl_1k.webp',
    armUrl: 'terrain/forest-leaves-02/forest_leaves_02_arm_1k.webp',
    heightUrl: 'terrain/forest-leaves-02/forest_leaves_02_disp_1k.webp',
    heightScale: HEIGHT_SCALE * 2,
    macroUvScale: MACRO_UV_SCALE,
    uvScale: DETAIL_UV_SCALE,
    roughness: ROUGHNESS * 1.17,
    blendDepth: BLEND_DEPTH_SOFT,
    normalConvention: 'opengl',
  },
  aerial_beach_01: {
    name: 'aerial_beach_01',
    albedoUrl: 'terrain/aerial-beach-01/aerial_beach_01_diff_1k.jpg',
    normalUrl: 'terrain/aerial-beach-01/aerial_beach_01_nor_gl_1k.webp',
    armUrl: 'terrain/aerial-beach-01/aerial_beach_01_arm_1k.webp',
    heightUrl: 'terrain/aerial-beach-01/aerial_beach_01_disp_1k.webp',
    heightScale: HEIGHT_SCALE,
    macroUvScale: MACRO_UV_SCALE,
    uvScale: DETAIL_UV_SCALE,
    roughness: ROUGHNESS * 1.17,
    blendDepth: BLEND_DEPTH_SOFT,
    normalConvention: 'opengl',
  },
  aerial_beach_02: {
    name: 'aerial_beach_02',
    albedoUrl: 'terrain/aerial-beach-02/aerial_beach_02_diff_1k.jpg',
    normalUrl: 'terrain/aerial-beach-02/aerial_beach_02_nor_gl_1k.webp',
    armUrl: 'terrain/aerial-beach-02/aerial_beach_02_arm_1k.webp',
    heightUrl: 'terrain/aerial-beach-02/aerial_beach_02_disp_1k.webp',
    heightScale: HEIGHT_SCALE * 5,
    macroUvScale: MACRO_UV_SCALE * 0.5,
    uvScale: DETAIL_UV_SCALE,
    roughness: ROUGHNESS * 0.95,
    blendDepth: BLEND_DEPTH_SOFT,
    normalConvention: 'opengl',
  },
  cliff_side_1k: {
    name: 'cliff_side_1k',
    albedoUrl: 'terrain/cliff-side/cliff_side_diff_1k.jpg',
    normalUrl: 'terrain/cliff-side/cliff_side_nor_gl_1k.webp',
    armUrl: 'terrain/cliff-side/cliff_side_arm_1k.webp',
    heightUrl: 'terrain/cliff-side/cliff_side_disp_1k.webp',
    macroNormalFrom: 'marble_cliff_05',
    heightScale: HEIGHT_SCALE * 4,
    macroUvScale: MACRO_UV_SCALE * 0.75,
    uvScale: DETAIL_UV_SCALE,
    roughness: ROUGHNESS * 0.91,
    normalConvention: 'opengl',
  },
  tiger_rock_1k: {
    name: 'tiger_rock_1k',
    albedoUrl: 'terrain/tiger-rock/tiger_rock_diff_1k.jpg',
    normalUrl: 'terrain/tiger-rock/tiger_rock_nor_gl_1k.webp',
    armUrl: 'terrain/tiger-rock/tiger_rock_arm_1k.webp',
    heightUrl: 'terrain/tiger-rock/tiger_rock_disp_1k.webp',
    macroNormalFrom: 'marble_cliff_05',
    heightScale: HEIGHT_SCALE * 1.8,
    macroUvScale: MACRO_UV_SCALE * 2,
    uvScale: DETAIL_UV_SCALE,
    roughness: ROUGHNESS * 0.85,
    normalConvention: 'opengl',
  },
  aerial_grass_rock: {
    name: 'aerial_grass_rock',
    albedoUrl: 'terrain/aerial-grass-rock/aerial_grass_rock_diff_1k.jpg',
    normalUrl: 'terrain/aerial-grass-rock/aerial_grass_rock_nor_gl_1k.webp',
    armUrl: 'terrain/aerial-grass-rock/aerial_grass_rock_arm_1k.webp',
    heightUrl: 'terrain/aerial-grass-rock/aerial_grass_rock_disp_1k.webp',
    heightScale: HEIGHT_SCALE * 0.5,
    macroUvScale: MACRO_UV_SCALE,
    uvScale: DETAIL_UV_SCALE,
    roughness: ROUGHNESS * 1.17,
    blendDepth: BLEND_DEPTH_SOFT,
    normalConvention: 'opengl',
  },
  grass_path_02_1k: {
    name: 'grass_path_02_1k',
    albedoUrl: 'terrain/grass-path-02/grass_path_02_diff_1k.jpg',
    normalUrl: 'terrain/grass-path-02/grass_path_2_nor_gl_1k.webp',
    armUrl: 'terrain/grass-path-02/grass_path_2_arm_1k.webp',
    heightUrl: 'terrain/grass-path-02/grass_path_2_disp_1k.webp',
    heightScale: HEIGHT_SCALE * 2,
    macroUvScale: MACRO_UV_SCALE * 2,
    uvScale: DETAIL_UV_SCALE,
    roughness: ROUGHNESS * 1.07,
    blendDepth: BLEND_DEPTH_SOFT,
    normalConvention: 'opengl',
  },
  forest_leaves_03_1k: {
    name: 'forest_leaves_03_1k',
    albedoUrl: 'terrain/forest-leaves-03/forest_leaves_03_diff_1k.jpg',
    normalUrl: 'terrain/forest-leaves-03/forest_leaves_03_nor_gl_1k.webp',
    armUrl: 'terrain/forest-leaves-03/forest_leaves_03_arm_1k.webp',
    heightUrl: 'terrain/forest-leaves-03/forest_leaves_03_disp_1k.webp',
    heightScale: HEIGHT_SCALE * 2,
    macroUvScale: MACRO_UV_SCALE,
    uvScale: DETAIL_UV_SCALE,
    roughness: ROUGHNESS * 1.17,
    blendDepth: BLEND_DEPTH_SOFT,
    normalConvention: 'opengl',
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
    // Zero is a legitimate off-switch — the shader documents heightScale 0 as
    // "samples flat, no parallax" and skips the march entirely. A *negative*
    // scale is always a sign slip that would carve relief away from the viewer.
    if (material.heightScale < 0)
      throw new Error(
        `Terrain material '${material.name}' heightScale must not be negative (0 disables parallax).`
      );

    if (
      material.macroUvScale !== undefined &&
      material.macroUvScale >= material.uvScale
    )
      throw new Error(
        `Terrain material '${material.name}' has macroUvScale ${material.macroUvScale} >= uvScale ${material.uvScale} — a macro normal must be coarser than the detail normal or it buys nothing.`
      );

    // macroUvScale is what switches the macro normal on, so a source or a
    // strength without one is a setting that silently does nothing.
    if (material.macroUvScale === undefined) {
      if (material.macroNormalFrom !== undefined)
        throw new Error(
          `Terrain material '${material.name}' sets macroNormalFrom without macroUvScale — it has no macro normal, so the source would be ignored.`
        );
      if (material.macroStrength !== undefined)
        throw new Error(
          `Terrain material '${material.name}' sets macroStrength without macroUvScale — it has no macro normal, so the strength would be ignored.`
        );
    }

    // There is one normal array, so a borrowed macro normal has to be a layer
    // in it — i.e. some material in this library. A name that isn't would
    // resolve to layer -1 and sample out of bounds.
    if (
      material.macroNormalFrom !== undefined &&
      !TERRAIN_MATERIALS[material.macroNormalFrom]
    )
      throw new Error(
        `Terrain material '${material.name}' macroNormalFrom '${material.macroNormalFrom}' is not in the library — a macro normal must be some material's normal layer.`
      );

    // Negative would flip the macro relief inside out against the detail relief
    // on the same fragment, which is never what an amplitude knob is for.
    if (material.macroStrength !== undefined && material.macroStrength < 0)
      throw new Error(
        `Terrain material '${material.name}' macroStrength must not be negative (0 is flat).`
      );
  }
}
