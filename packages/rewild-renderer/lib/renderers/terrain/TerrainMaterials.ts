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
  // Linear grayscale roughness. Sampled per texel and folded into the specular
  // highlight as gloss = 1 - roughness, so the highlight follows the surface
  // (damp rock catches the sun, dry grass stays matte) instead of the whole
  // layer glinting uniformly. Only the red channel is read.
  roughnessUrl: string;
  // Linear grayscale height/displacement: 0 the deepest crevice, 1 the highest
  // peak of the surface relief. The terrain shader's parallax-occlusion march
  // treats this as a depth volume carved below the surface — view rays march
  // inward until they strike the heightfield, so texels sit at the apparent
  // height their relief implies rather than flat on the geometry, and near
  // relief occludes far relief. Only the red channel is read. It also drives
  // the height-aware layer blend: taller texels win material transitions.
  heightUrl: string;
  // Depth of the parallax volume, in tile-UV units (one tile = 1.0), before
  // the shader's distance fade. Bigger ⇒ deeper apparent relief; 0 disables
  // parallax for this material. Expect to tune per material.
  heightScale: number;
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
  // multiply by 1.0. This is *how much* the surface glints.
  specular: number;
  // Blinn-Phong specular exponent — *how tight* the glint is (its glossiness).
  // Low (~8) is a broad, soft sheen; high (~64+) is a small, sharp sun-glint.
  // Blended per-fragment across the active materials, so wet rock can hold a
  // tight highlight in the same spot dry grass stays matte. The energy-
  // conserving lighting brightens tighter lobes automatically, so raising this
  // sharpens *and* intensifies the glint.
  shininess: number;
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
  //
  // Applied from whichever layer is *winning* at a fragment, so a pair that
  // should blend softly wants the soft value on both of its materials.
  // Omitted ⇒ BLEND_DEPTH.
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

// Base specular exponent (gloss). Matte ground sits below it, hard/wet surfaces
// (rock, marble, snow crust) above — see each material's shininess.
const SHININESS = 32;
const SPECULAR = 1;

// Default transition width — the hard, interlocking edge the height-aware blend
// was built for, and what a material without its own `blendDepth` gets.
// Materials that should intermingle override it upward; see
// TerrainMaterial.blendDepth.
export const BLEND_DEPTH = 0.2;

// Transition width for materials that mix rather than meet: wide enough that
// per-texel relief no longer decides the boundary on its own, leaving the splat
// weight to carry a soft crossfade.
const BLEND_DEPTH_SOFT = 0.7;

const ROCK_NORMAL_URL = 'terrain/rocks-ground-01/rocks_ground_01_norm_1k.png';

export const TERRAIN_MATERIALS: Record<string, TerrainMaterial> = {
  'forest-ground-01': {
    name: 'forest-ground-01',
    albedoUrl: 'terrain/forest-ground-01/forrest_ground_01_diff_1k.jpg',
    normalUrl: 'terrain/forest-ground-01/forrest_ground_01_norm_1k.png',
    roughnessUrl: 'terrain/forest-ground-01/forrest_ground_01_rough_1k.jpg',
    heightUrl: 'terrain/forest-ground-01/forrest_ground_01_disp_1k.png',
    heightScale: HEIGHT_SCALE,
    macroNormalUrl: 'terrain/forest-ground-01/forrest_ground_01_norm_1k.png',
    macroUvScale: MACRO_UV_SCALE * 2,
    uvScale: DETAIL_UV_SCALE,
    specular: SPECULAR * 0.3,
    shininess: SHININESS * 0.5, // matte grass/soil
    // Pairs with forest_leaves_02 under a noise selector — litter scattered
    // over soil, which should intermingle rather than meet along an edge.
    blendDepth: BLEND_DEPTH_SOFT,
    normalConvention: 'opengl', // Poly Haven
  },
  'ground-coastal-01': {
    name: 'ground-coastal-01',
    albedoUrl:
      'terrain/ground-coastal-01/TexturesCom_Ground_Coastal1_2x2_1K_albedo.png',
    normalUrl:
      'terrain/ground-coastal-01/TexturesCom_Ground_Coastal1_2x2_1K_normal.png',
    roughnessUrl:
      'terrain/ground-coastal-01/TexturesCom_Ground_Coastal1_2x2_1K_roughness.png',
    heightUrl:
      'terrain/ground-coastal-01/TexturesCom_Ground_Coastal1_2x2_1K_height.png',
    heightScale: HEIGHT_SCALE,
    macroNormalUrl:
      'terrain/ground-coastal-01/TexturesCom_Ground_Coastal1_2x2_1K_normal.png',
    uvScale: DETAIL_UV_SCALE,
    macroUvScale: MACRO_UV_SCALE,
    specular: SPECULAR * 0.18,
    shininess: SHININESS * 0.75,
    // TexturesCom, not Poly Haven — this one is a guess. If coastal ground
    // alone reads inset while the others look right, flip it to 'directx'.
    normalConvention: 'opengl',
  },
  // The only material that reads at silhouette distance, so it is the one that
  // gets a macro normal — reusing its own detail normal at a much larger scale
  // rather than a purpose-authored macro map. Cheap, tunable, and enough to
  // tell whether the technique earns a dedicated asset.
  'rocks-ground-01': {
    name: 'rocks-ground-01',
    albedoUrl: 'terrain/rocks-ground-01/rocks_ground_01_diff_1k.jpg',
    normalUrl: ROCK_NORMAL_URL,
    roughnessUrl: 'terrain/rocks-ground-01/rocks_ground_01_rough_1k.jpg',
    heightUrl: 'terrain/rocks-ground-01/rocks_ground_01_disp_1k.png',
    heightScale: HEIGHT_SCALE * 1.8,
    uvScale: DETAIL_UV_SCALE,
    macroNormalUrl: ROCK_NORMAL_URL,
    macroUvScale: MACRO_UV_SCALE,
    specular: SPECULAR * 0.4,
    shininess: SHININESS * 1.5,
    normalConvention: 'opengl', // Poly Haven
  },
  'snow-02': {
    name: 'snow-02',
    albedoUrl: 'terrain/snow-02/snow_02_diff_1k.jpg',
    normalUrl: 'terrain/snow-02/snow_02_norm_1k.png',
    roughnessUrl: 'terrain/snow-02/snow_02_rough_1k.jpg',
    heightUrl: 'terrain/snow-02/snow_02_disp_1k.png',
    macroNormalUrl: 'terrain/snow-02/snow_02_norm_1k.png',
    macroUvScale: MACRO_UV_SCALE,
    heightScale: HEIGHT_SCALE * 0.5,
    uvScale: DETAIL_UV_SCALE,
    specular: SPECULAR * 0.55,
    shininess: SHININESS * 2,
    normalConvention: 'opengl', // Poly Haven
  },
  rocky_terrain: {
    name: 'rocky_terrain',
    albedoUrl: 'terrain/rocky-terrain/rocky_terrain_diff_1k.jpg',
    normalUrl: 'terrain/rocky-terrain/rocky_terrain_norm_1k.png',
    roughnessUrl: 'terrain/rocky-terrain/rocky_terrain_rough_1k.png',
    heightUrl: 'terrain/rocky-terrain/rocky_terrain_disp_1k.png',
    heightScale: HEIGHT_SCALE * 1.6,
    macroNormalUrl: 'terrain/rocky-terrain/rocky_terrain_norm_1k.png',
    macroUvScale: MACRO_UV_SCALE * 2,
    uvScale: DETAIL_UV_SCALE,
    specular: SPECULAR * 0.3,
    shininess: SHININESS * 1.5,
    normalConvention: 'opengl', // Poly Haven
  },
  aerial_rocks_01: {
    name: 'aerial_rocks_01',
    albedoUrl: 'terrain/aerial_rocks_01/aerial_rocks_01_diff_1k.jpg',
    normalUrl: 'terrain/aerial_rocks_01/aerial_rocks_01_norm_1k.png',
    roughnessUrl: 'terrain/aerial_rocks_01/aerial_rocks_01_rough_1k.jpg',
    heightUrl: 'terrain/aerial_rocks_01/aerial_rocks_01_disp_1k.png',
    heightScale: HEIGHT_SCALE * 1.6,
    macroNormalUrl: 'terrain/aerial_rocks_01/aerial_rocks_01_norm_1k.png',
    macroUvScale: MACRO_UV_SCALE * 2,
    uvScale: DETAIL_UV_SCALE,
    specular: SPECULAR * 0.2,
    shininess: SHININESS * 6,
    normalConvention: 'opengl', // Poly Haven
  },
  marble_cliff_05: {
    name: 'marble_cliff_05',
    albedoUrl: 'terrain/marble-cliff-05/marble_cliff_05_diff_1k.jpg',
    normalUrl: 'terrain/marble-cliff-05/marble_cliff_05_norm_1k.png',
    roughnessUrl: 'terrain/marble-cliff-05/marble_cliff_05_rough_1k.png',
    heightUrl: 'terrain/marble-cliff-05/marble_cliff_05_disp_1k.png',
    heightScale: HEIGHT_SCALE * 4,
    macroNormalUrl: 'terrain/marble-cliff-05/marble_cliff_05_norm_1k.png',
    macroUvScale: MACRO_UV_SCALE * 2,
    uvScale: DETAIL_UV_SCALE,
    specular: SPECULAR * 0.2,
    shininess: SHININESS * 4.5, // polished marble — tightest glint
    normalConvention: 'opengl', // Poly Haven
  },
  // The desert's crust, in the pans between dunes. Its relief is the deepest in
  // the library relative to its scale — the cracks are narrow and steep, which
  // is exactly the geometry parallax-occlusion sells best, and they flatten to
  // a beige wash without it.
  mud_cracked_dry_03: {
    name: 'mud_cracked_dry_03',
    albedoUrl: 'terrain/mud-cracked-dry-03/mud_cracked_dry_03_diff_1k.jpg',
    normalUrl: 'terrain/mud-cracked-dry-03/mud_cracked_dry_03_norm_1k.png',
    roughnessUrl: 'terrain/mud-cracked-dry-03/mud_cracked_dry_03_rough_1k.png',
    heightUrl: 'terrain/mud-cracked-dry-03/mud_cracked_dry_03_disp_1k.png',
    heightScale: HEIGHT_SCALE * 1.5,
    macroNormalUrl: 'terrain/mud-cracked-dry-03/mud_cracked_dry_03_norm_1k.png',
    macroUvScale: MACRO_UV_SCALE * 5,
    uvScale: DETAIL_UV_SCALE,
    specular: SPECULAR * 0.4,
    blendDepth: BLEND_DEPTH_SOFT,
    shininess: SHININESS * 0.75, // dry and dusty — no glint to speak of
    normalConvention: 'opengl', // Poly Haven
  },
  // The desert's dune bodies. Shallow relief on purpose: sand ripples are
  // millimetres, and a deep parallax volume on a surface this smooth reads as
  // the ground boiling as the camera moves.
  sand_01: {
    name: 'sand_01',
    albedoUrl: 'terrain/sand-01/sand_01_diff_1k.jpg',
    normalUrl: 'terrain/sand-01/sand_01_norm_1k.png',
    roughnessUrl: 'terrain/sand-01/sand_01_rough_1k.jpg',
    heightUrl: 'terrain/sand-01/sand_01_disp_1k.png',
    heightScale: HEIGHT_SCALE * 2,
    macroNormalUrl: 'terrain/sand-01/sand_01_norm_1k.png',
    // Coarser than the other macro normals: what a dune field should hold at
    // range is the long swell, not the grain.
    macroUvScale: MACRO_UV_SCALE,
    uvScale: DETAIL_UV_SCALE,
    // Dry sand is matte but not dead — a broad, low sheen down the sunlit flank
    // is most of what makes a dune read as a dune.
    specular: SPECULAR * 0.35,
    shininess: SHININESS * 0.5,
    blendDepth: BLEND_DEPTH_SOFT,
    normalConvention: 'opengl', // Poly Haven
  },
  forest_leaves_02: {
    name: 'forest_leaves_02',
    albedoUrl: 'terrain/forest-leaves-02/forest_leaves_02_diffuse_1k.jpg',
    normalUrl: 'terrain/forest-leaves-02/forest_leaves_02_norm_1k.png',
    roughnessUrl: 'terrain/forest-leaves-02/forest_leaves_02_rough_1k.jpg',
    heightUrl: 'terrain/forest-leaves-02/forest_leaves_02_disp_1k.png',
    heightScale: HEIGHT_SCALE * 2,
    macroNormalUrl: 'terrain/forest-leaves-02/forest_leaves_02_norm_1k.png',
    macroUvScale: MACRO_UV_SCALE,
    uvScale: DETAIL_UV_SCALE,
    specular: SPECULAR * 0.35,
    shininess: SHININESS * 0.5,
    // The soft half of the forest floor pair — see forest-ground-01.
    blendDepth: BLEND_DEPTH_SOFT,
    normalConvention: 'opengl', // Poly Haven
  },
  // The dry, pale upper beach — wind-rippled and bleached almost grey. Shallow
  // relief for the same reason as sand_01: the ripples are millimetres, and a
  // deep parallax volume on a surface this smooth reads as boiling ground.
  aerial_beach_01: {
    name: 'aerial_beach_01',
    albedoUrl: 'terrain/aerial-beach-01/aerial_beach_01_diff_1k.jpg',
    normalUrl: 'terrain/aerial-beach-01/aerial_beach_01_norm_1k.png',
    roughnessUrl: 'terrain/aerial-beach-01/aerial_beach_01_rough_1k.jpg',
    heightUrl: 'terrain/aerial-beach-01/aerial_beach_01_disp_1k.png',
    heightScale: HEIGHT_SCALE,
    macroNormalUrl: 'terrain/aerial-beach-01/aerial_beach_01_norm_1k.png',
    macroUvScale: MACRO_UV_SCALE,
    uvScale: DETAIL_UV_SCALE,
    specular: SPECULAR * 0.3,
    shininess: SHININESS * 0.5, // dry sand — a broad, matte sheen
    // Pairs with aerial_beach_02 across a height band; damp and dry sand should
    // intermingle over a tide line, not meet along an edge.
    blendDepth: BLEND_DEPTH_SOFT,
    normalConvention: 'opengl', // Poly Haven
  },
  // The damp lower beach: darker, and carrying dune-scale forms rather than
  // grain, which is what makes it read as the surface the tide last worked.
  aerial_beach_02: {
    name: 'aerial_beach_02',
    albedoUrl: 'terrain/aerial-beach-02/aerial_beach_02_diff_1k.jpg',
    normalUrl: 'terrain/aerial-beach-02/aerial_beach_02_norm_1k.png',
    roughnessUrl: 'terrain/aerial-beach-02/aerial_beach_02_rough_1k.jpg',
    heightUrl: 'terrain/aerial-beach-02/aerial_beach_02_disp_1k.png',
    heightScale: HEIGHT_SCALE * 1.5,
    macroNormalUrl: 'terrain/aerial-beach-02/aerial_beach_02_norm_1k.png',
    macroUvScale: MACRO_UV_SCALE,
    uvScale: DETAIL_UV_SCALE,
    // Damp sand is the one sand that genuinely glints — a tighter, stronger
    // highlight than its dry counterpart is most of what sells it as wet.
    specular: SPECULAR * 0.5,
    shininess: SHININESS * 1.25,
    blendDepth: BLEND_DEPTH_SOFT, // the soft half of the beach pair
    // TexturesCom-style pack, not confirmed Poly Haven — this is a guess. If
    // the beach alone reads inset while the others look right, flip to 'directx'.
    normalConvention: 'opengl',
  },
  // Stratified sandstone: horizontal bedding with deep, hard-edged ledges. The
  // deepest parallax volume in the library alongside marble_cliff_05 — the
  // bedding *is* the material, and it flattens to a tan wash without it.
  cliff_side_1k: {
    name: 'cliff_side_1k',
    albedoUrl: 'terrain/cliff-side-1k/cliff_side_diff_1k.jpg',
    normalUrl: 'terrain/cliff-side-1k/cliff_side_norm_1k.png',
    roughnessUrl: 'terrain/cliff-side-1k/cliff_side_rough_1k.png',
    heightUrl: 'terrain/cliff-side-1k/cliff_side_disp_1k.png',
    heightScale: HEIGHT_SCALE * 4,
    macroNormalUrl: 'terrain/cliff-side-1k/cliff_side_norm_1k.png',
    // Coarse on purpose: the strata are what a mesa should still show in
    // silhouette, and they are metres apart, not centimetres.
    macroUvScale: MACRO_UV_SCALE * 2,
    uvScale: DETAIL_UV_SCALE,
    specular: SPECULAR * 0.2,
    shininess: SHININESS * 1.5, // dry stone — present but not polished
    // No blendDepth: the default hard edge is what this is for. Ledges should
    // break through the rock beneath them along their own relief.
    normalConvention: 'opengl',
  },
  // Coarse mottled granite in rust and near-black. The desert mountain's body
  // rock — busy enough at detail scale that it does not need a companion
  // material to stop reading as a flat colour.
  tiger_rock_1k: {
    name: 'tiger_rock_1k',
    albedoUrl: 'terrain/tiger-rock-1k/tiger_rock_diff_1k.jpg',
    normalUrl: 'terrain/tiger-rock-1k/tiger_rock_norm_1k.png',
    roughnessUrl: 'terrain/tiger-rock-1k/tiger_rock_rough_1k.png',
    heightUrl: 'terrain/tiger-rock-1k/tiger_rock_disp_1k.png',
    heightScale: HEIGHT_SCALE * 1.8,
    macroNormalUrl: 'terrain/tiger-rock-1k/tiger_rock_norm_1k.png',
    macroUvScale: MACRO_UV_SCALE * 2,
    uvScale: DETAIL_UV_SCALE,
    specular: SPECULAR * 0.25,
    shininess: SHININESS * 2,
    // No blendDepth: sand drifting against it should meet the rock along the
    // rock's own crevices, which is exactly what the default hard edge does.
    normalConvention: 'opengl',
  },
  // Dense green sward — the plain's body material. Its relief is blade-scale,
  // so the parallax volume stays shallow: a deep one on a surface this fine
  // reads as the ground swimming rather than as grass standing up.
  grass_01_1k: {
    name: 'grass_01_1k',
    albedoUrl: 'terrain/grass-01-1k/grass_01.png',
    normalUrl: 'terrain/grass-01-1k/grass_01_norm.png',
    roughnessUrl: 'terrain/grass-01-1k/grass_01_roughness.png',
    heightUrl: 'terrain/grass-01-1k/grass_01_disp.png',
    heightScale: HEIGHT_SCALE * 0.5,
    macroNormalUrl: 'terrain/grass-01-1k/grass_01_norm.png',
    // Coarse: what a grassland should still carry at range is the swell of the
    // sward, not the blades — those mip to a flat green wash regardless.
    macroUvScale: MACRO_UV_SCALE,
    uvScale: DETAIL_UV_SCALE,
    specular: SPECULAR * 0.25,
    shininess: SHININESS * 0.5, // matte — dry grass has no glint to speak of
    // Pairs with grass_path_02_1k under a noise selector: worn ground bleeding
    // into grass, which should intermingle rather than meet along an edge.
    blendDepth: BLEND_DEPTH_SOFT,
    // Not a Poly Haven pack (its maps are named _norm/_roughness/_disp with no
    // resolution suffix), so the convention is a guess. If grass alone reads
    // inset while the others look right, flip it to 'directx'.
    normalConvention: 'opengl',
  },
  // Trodden ground: bare compacted earth with grass giving way at its margins.
  // Deeper relief than the sward it scatters over — ruts and hoof-prints are
  // centimetres, and they are the whole reason a path reads as walked on.
  grass_path_02_1k: {
    name: 'grass_path_02_1k',
    albedoUrl: 'terrain/grass-path-02-1k/grass_path_02_diff_1k.jpg',
    normalUrl: 'terrain/grass-path-02-1k/grass_path_02_norm_1k.png',
    roughnessUrl: 'terrain/grass-path-02-1k/grass_path_02_rough_1k.jpg',
    heightUrl: 'terrain/grass-path-02-1k/grass_path_02_disp_1k.png',
    heightScale: HEIGHT_SCALE * 2,
    macroNormalUrl: 'terrain/grass-path-02-1k/grass_path_02_norm_1k.png',
    macroUvScale: MACRO_UV_SCALE * 2,
    uvScale: DETAIL_UV_SCALE,
    specular: SPECULAR * 0.3,
    shininess: SHININESS * 0.75, // bare earth — dusty, barely brighter than grass
    blendDepth: BLEND_DEPTH_SOFT, // the soft half of the grassland pair
    normalConvention: 'opengl', // Poly Haven
  },
  // Deep broadleaf litter — the forest's body material, in place of bare soil.
  // A forest floor is the leaves that fell on it, not the dirt underneath, and
  // this reads that way where forest-ground-01 read as a worn track.
  //
  // Deep parallax on purpose: stacked leaves are the one ground surface whose
  // relief is genuinely centimetres, and the near-over-far occlusion the march
  // gives is most of what stops litter looking like a printed pattern.
  forest_leaves_03_1k: {
    name: 'forest_leaves_03_1k',
    albedoUrl: 'terrain/forest-leaves-03-1k/forest_leaves_03_diff_1k.jpg',
    normalUrl: 'terrain/forest-leaves-03-1k/forest_leaves_03_norm_1k.png',
    roughnessUrl: 'terrain/forest-leaves-03-1k/forest_leaves_03_rough_1k.png',
    heightUrl: 'terrain/forest-leaves-03-1k/forest_leaves_03_disp_1k.png',
    heightScale: HEIGHT_SCALE * 2,
    macroNormalUrl: 'terrain/forest-leaves-03-1k/forest_leaves_03_norm_1k.png',
    macroUvScale: MACRO_UV_SCALE,
    uvScale: DETAIL_UV_SCALE,
    specular: SPECULAR * 0.35,
    shininess: SHININESS * 0.5, // dry leaves — matte, with a faint waxy sheen
    // Pairs with forest_leaves_02 under a noise selector: two litters of the
    // same floor, which should intermingle rather than meet along an edge.
    blendDepth: BLEND_DEPTH_SOFT,
    normalConvention: 'opengl', // Poly Haven
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

    // There is no separate macro-normal array, so the macro normal is the
    // material's own normal array layer sampled at macroUvScale. A macro map
    // that is a *different* texture would need its own array — deliberately not
    // built for materials that currently reuse their own normal.
    if (
      material.macroNormalUrl &&
      material.macroNormalUrl !== material.normalUrl
    )
      throw new Error(
        `Terrain material '${material.name}' macroNormalUrl must be its own normalUrl — a distinct macro map needs a third texture array, which does not exist yet.`
      );
  }
}
