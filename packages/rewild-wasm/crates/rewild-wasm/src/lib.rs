//! The one WASM module the rewild workers load. Each library crate does its
//! work in plain Rust, and this crate only exposes it to JS.

use wasm_bindgen::prelude::*;

/// A built BVH. Take each array once, then call `free()`.
#[wasm_bindgen]
pub struct BvhBuild {
    nodes: Vec<u32>,
    tri_indices: Vec<u32>,
}

#[wasm_bindgen]
impl BvhBuild {
    /// The nodes, in the layout `BVHTree` reads. Copied into a new
    /// `Uint32Array`. Empty after the first call.
    #[wasm_bindgen(js_name = takeNodes)]
    pub fn take_nodes(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.nodes)
    }

    /// The reordered triangle indices. Copied into a new `Uint32Array`. Empty
    /// after the first call.
    #[wasm_bindgen(js_name = takeTriIndices)]
    pub fn take_tri_indices(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.tri_indices)
    }
}

/// Builds a BVH over `vertices` (flat xyz). See `bvh::build`.
///
/// `strategy` is `'sah'` or `'center'`, as in `BVHOptions`.
#[wasm_bindgen(js_name = buildBvh)]
pub fn build_bvh(
    vertices: &[f32],
    indices: Option<Vec<u32>>,
    strategy: &str,
    max_depth: u32,
    max_leaf_triangles: u32,
) -> Result<BvhBuild, JsError> {
    let strategy = match strategy {
        "sah" => bvh::Strategy::Sah,
        "center" => bvh::Strategy::Center,
        other => return Err(JsError::new(&format!("unknown BVH strategy '{other}'"))),
    };
    let built = bvh::build(
        vertices,
        indices.as_deref(),
        bvh::Options {
            strategy,
            max_depth,
            max_leaf_triangles,
        },
    );
    Ok(BvhBuild {
        nodes: built.node_words(),
        tri_indices: built.tri_indices,
    })
}

/// Recomputes the bounds of a built BVH's `nodes` in place after `vertices`
/// move. See `bvh::refit`.
#[wasm_bindgen(js_name = refitBvh)]
pub fn refit_bvh(nodes: &mut [u32], vertices: &[f32], tri_indices: &[u32]) {
    bvh::refit(bvh::Node::from_words_mut(nodes), vertices, tri_indices);
}

/// A far map for the horizon, built a few rows at a time. See
/// `terrain::FarMap`. Take its arrays once it is done, then call `free()`.
#[wasm_bindgen]
pub struct FarMapBuild(terrain::FarMap);

#[wasm_bindgen]
impl FarMapBuild {
    /// A map of `texels`² over `span` metres centred on world (`centreX`,
    /// `centreZ`).
    #[wasm_bindgen(constructor)]
    pub fn new(centre_x: f64, centre_z: f64, span: f64, texels: u32) -> FarMapBuild {
        FarMapBuild(terrain::FarMap::new(centre_x, centre_z, span, texels as usize))
    }

    /// Builds up to `rows` more rows of `generator`'s world; returns whether
    /// the map is complete.
    pub fn build(&mut self, generator: &TerrainGenerator, rows: u32) -> bool {
        self.0.build(&generator.heights, &generator.splat, rows as usize)
    }

    /// rg16float bits per texel: height, then continent.
    #[wasm_bindgen(js_name = takeGround)]
    pub fn take_ground(&mut self) -> Vec<u16> {
        std::mem::take(&mut self.0.ground)
    }

    /// Palette weights as two RGBA8 planes.
    #[wasm_bindgen(js_name = takeWeights)]
    pub fn take_weights(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.0.weights)
    }
}

/// A built chunk mesh. Take each array once, then call `free()`.
#[wasm_bindgen]
pub struct TerrainMeshBuild(terrain::mesh::Mesh);

#[wasm_bindgen]
impl TerrainMeshBuild {
    #[wasm_bindgen(js_name = takeVertices)]
    pub fn take_vertices(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.0.vertices)
    }

    #[wasm_bindgen(js_name = takeUvs)]
    pub fn take_uvs(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.0.uvs)
    }

    #[wasm_bindgen(js_name = takeNormals)]
    pub fn take_normals(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.0.normals)
    }

    #[wasm_bindgen(js_name = takeIndices)]
    pub fn take_indices(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.0.indices)
    }
}

/// The mesh of a `size` × `size` chunk at `lod` over `heights`, which carries
/// `apron` rings of neighbour samples. See `terrain::mesh::build`.
#[wasm_bindgen(js_name = buildTerrainMesh)]
pub fn build_terrain_mesh(
    heights: &[f32],
    size: u32,
    apron: u32,
    lod: u32,
    horizontal_scale: f64,
) -> Result<TerrainMeshBuild, JsError> {
    terrain::mesh::build(heights, size as usize, apron as usize, lod, horizontal_scale)
        .map(TerrainMeshBuild)
        .map_err(|e| JsError::new(&e))
}

/// Terrain generation for one world. Build once per climate preset, seed and
/// sea level, then generate chunks and sample points from it.
#[wasm_bindgen]
pub struct TerrainGenerator {
    heights: terrain::HeightGenerator,
    splat: terrain::SplatGenerator,
    scatter: terrain::ScatterGenerator,
}

/// An owned paint mask, copied in for one call.
struct OwnedMask {
    weights: Vec<u8>,
    size: usize,
    step: f64,
}

impl OwnedMask {
    fn view(&self) -> terrain::PaintMask<'_> {
        terrain::PaintMask {
            size: self.size,
            step: self.step,
            channels: self.weights.len() / (self.size * self.size),
            weights: &self.weights,
        }
    }
}

fn owned_mask(weights: Vec<u8>, size: u32, step: u32) -> Result<OwnedMask, JsError> {
    let plane = (size * size) as usize;
    if plane == 0 || !weights.len().is_multiple_of(plane) {
        return Err(JsError::new("Paint mask weights do not fill whole planes."));
    }
    Ok(OwnedMask { weights, size: size as usize, step: step as f64 })
}

/// What a chunk adds to scatter placement. See `terrain::ScatterRequest`.
#[wasm_bindgen]
#[derive(Default)]
pub struct ScatterRequestData {
    biome_mask: Option<OwnedMask>,
    density_mask: Option<OwnedMask>,
    kills: Vec<u32>,
    region: Option<terrain::scatter::SampleBox>,
    with_ids: bool,
    water_edit: Option<terrain::WaterEdit>,
}

#[wasm_bindgen]
impl ScatterRequestData {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ScatterRequestData {
        ScatterRequestData::default()
    }

    /// The chunk's painted biomes, channel-major planes.
    #[wasm_bindgen(js_name = setBiomeMask)]
    pub fn set_biome_mask(&mut self, weights: Vec<u8>, size: u32, step: u32) -> Result<(), JsError> {
        self.biome_mask = Some(owned_mask(weights, size, step)?);
        Ok(())
    }

    /// The chunk's painted scatter density, channel-major planes.
    #[wasm_bindgen(js_name = setDensityMask)]
    pub fn set_density_mask(&mut self, weights: Vec<u8>, size: u32, step: u32) -> Result<(), JsError> {
        self.density_mask = Some(owned_mask(weights, size, step)?);
        Ok(())
    }

    /// Kill keys of the chunk's plucked instances, in any order.
    #[wasm_bindgen(js_name = setKills)]
    pub fn set_kills(&mut self, mut keys: Vec<u32>) {
        keys.sort_unstable();
        self.kills = keys;
    }

    /// Places only the cells overlapping chunk samples (x0, y0)–(x1, y1).
    #[wasm_bindgen(js_name = setRegion)]
    pub fn set_region(&mut self, x0: f64, y0: f64, x1: f64, y1: f64) {
        self.region = Some(terrain::scatter::SampleBox { x0, y0, x1, y1 });
    }

    /// Report each instance's kill key.
    #[wasm_bindgen(js_name = setWithIds)]
    pub fn set_with_ids(&mut self, with_ids: bool) {
        self.with_ids = with_ids;
    }

    #[wasm_bindgen(js_name = setWaterEdit)]
    pub fn set_water_edit(&mut self, edit: WaterEditData) {
        self.water_edit = Some(edit.0);
    }
}

/// A chunk's scatter, one entry per layer that placed anything, in slot
/// order. Take each layer's arrays once, then call `free()`.
#[wasm_bindgen]
pub struct ScatterBuild(Vec<terrain::scatter::LayerInstances>);

#[wasm_bindgen]
impl ScatterBuild {
    #[wasm_bindgen(getter, js_name = layerCount)]
    pub fn layer_count(&self) -> usize {
        self.0.len()
    }

    /// Entry `i`'s library slot.
    pub fn slot(&self, i: usize) -> usize {
        self.0[i].slot
    }

    /// Entry `i`'s instance count.
    pub fn count(&self, i: usize) -> usize {
        self.0[i].count
    }

    /// Entry `i`'s instances, `INSTANCE_STRIDE` floats each.
    #[wasm_bindgen(js_name = takeData)]
    pub fn take_data(&mut self, i: usize) -> Vec<f32> {
        std::mem::take(&mut self.0[i].data)
    }

    /// Entry `i`'s kill keys; empty unless asked for.
    #[wasm_bindgen(js_name = takeIds)]
    pub fn take_ids(&mut self, i: usize) -> Vec<u32> {
        std::mem::take(&mut self.0[i].ids)
    }
}

fn from_js<T: serde::de::DeserializeOwned>(value: JsValue) -> Result<T, JsError> {
    serde_wasm_bindgen::from_value(value).map_err(|e| JsError::new(&e.to_string()))
}

fn to_js<T: serde::Serialize>(value: &T) -> Result<JsValue, JsError> {
    let serializer = serde_wasm_bindgen::Serializer::new().serialize_missing_as_null(true);
    value.serialize(&serializer).map_err(|e| JsError::new(&e.to_string()))
}

/// A chunk's water edit, copied in for one call. See `WaterEdit.ts`.
#[wasm_bindgen]
pub struct WaterEditData(terrain::WaterEdit);

#[wasm_bindgen]
impl WaterEditData {
    /// `weights` holds the mask's channel-major planes.
    #[wasm_bindgen(constructor)]
    pub fn new(weights: Vec<u8>, size: u32, step: u32, level: Vec<f32>, body_ids: Vec<u32>) -> Result<WaterEditData, JsError> {
        let texels = (size * size) as usize;
        if weights.len() != texels * terrain::water::EDIT_CHANNELS || level.len() != texels || body_ids.len() != texels {
            return Err(JsError::new("Water edit planes do not match its size."));
        }
        Ok(WaterEditData(terrain::WaterEdit { size: size as usize, step: step as f64, weights, level, body_ids }))
    }
}

/// A chunk's resolved water. Take each array once, then call `free()`.
#[wasm_bindgen]
pub struct ResolvedWaterBuild(terrain::water::ResolvedWater);

#[wasm_bindgen]
impl ResolvedWaterBuild {
    #[wasm_bindgen(getter)]
    pub fn covered(&self) -> bool {
        self.0.covered
    }

    #[wasm_bindgen(js_name = takeCoverage)]
    pub fn take_coverage(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.0.coverage)
    }

    #[wasm_bindgen(js_name = takeLevels)]
    pub fn take_levels(&mut self) -> Vec<f64> {
        std::mem::take(&mut self.0.levels)
    }

    #[wasm_bindgen(js_name = takeTypeWeights)]
    pub fn take_type_weights(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.0.type_weights)
    }

    #[wasm_bindgen(js_name = takeBodyIds)]
    pub fn take_body_ids(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.0.body_ids)
    }

    /// The generated lakes that reach the chunk, as `Lake` records.
    pub fn lakes(&self) -> Result<JsValue, JsError> {
        to_js(&self.0.lakes)
    }
}

/// A chunk's water map. Take each array once, then call `free()`.
#[wasm_bindgen]
pub struct WaterMapBuild(terrain::WaterMap);

#[wasm_bindgen]
impl WaterMapBuild {
    #[wasm_bindgen(getter, js_name = baseLevel)]
    pub fn base_level(&self) -> f64 {
        self.0.base_level
    }

    #[wasm_bindgen(getter, js_name = maxLevel)]
    pub fn max_level(&self) -> f64 {
        self.0.max_level
    }

    #[wasm_bindgen(getter)]
    pub fn shows(&self) -> bool {
        self.0.shows
    }

    /// f16 bits: water surface height − baseLevel.
    #[wasm_bindgen(js_name = takeLevel)]
    pub fn take_level(&mut self) -> Vec<u16> {
        std::mem::take(&mut self.0.level)
    }

    /// f16 bits: terrain height − baseLevel.
    #[wasm_bindgen(js_name = takeHeights)]
    pub fn take_heights(&mut self) -> Vec<u16> {
        std::mem::take(&mut self.0.heights)
    }

    #[wasm_bindgen(js_name = takeCoverage)]
    pub fn take_coverage(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.0.water.coverage)
    }

    #[wasm_bindgen(js_name = takeTypeWeights)]
    pub fn take_type_weights(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.0.water.type_weights)
    }

    #[wasm_bindgen(js_name = takeBodyIds)]
    pub fn take_body_ids(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.0.water.body_ids)
    }

    /// The first texel each covering body owns, in texel order.
    #[wasm_bindgen(js_name = bodyTexels)]
    pub fn body_texels(&self) -> Vec<u32> {
        self.0.body_texels.clone()
    }

    /// The world level at each of `bodyTexels`.
    #[wasm_bindgen(js_name = bodyLevels)]
    pub fn body_levels(&self) -> Vec<f64> {
        self.0.body_texels.iter().map(|&t| self.0.water.levels[t as usize]).collect()
    }

    /// The generated lakes that reach the chunk, as `Lake` records.
    pub fn lakes(&self) -> Result<JsValue, JsError> {
        to_js(&self.0.water.lakes)
    }
}

#[wasm_bindgen]
impl TerrainGenerator {
    /// `climate` is a `ClimateConfig`; `splat` is `{ palette, coastMaterials }`
    /// (see `terrain::SplatSpec`); `scatterLayers` is the scatter layer library
    /// in slot order. Throws if any is invalid.
    #[wasm_bindgen(constructor)]
    pub fn new(
        climate: JsValue,
        splat: JsValue,
        scatter_layers: JsValue,
        seed: f64,
        sea_level: f64,
        meters_per_sample: f64,
    ) -> Result<TerrainGenerator, JsError> {
        let climate: terrain::ClimateConfig = from_js(climate)?;
        let spec: terrain::SplatSpec = from_js(splat)?;
        let layers: Vec<terrain::ScatterLayer> = from_js(scatter_layers)?;
        let scatter = terrain::ScatterGenerator::new(climate.clone(), layers, seed, sea_level, meters_per_sample)
            .map_err(|e| JsError::new(&e))?;
        let heights = terrain::HeightGenerator::new(climate.clone(), seed, sea_level, meters_per_sample)
            .map_err(|e| JsError::new(&e))?;
        let splat = terrain::SplatGenerator::new(climate, &spec, seed, sea_level, meters_per_sample)
            .map_err(|e| JsError::new(&e))?;
        Ok(TerrainGenerator { heights, splat, scatter })
    }

    /// A `width` × `height` height field at chunk offset (`offsetX`,
    /// `offsetY`), with lakes carved. See `terrain::HeightGenerator`.
    pub fn heights(&self, width: u32, height: u32, offset_x: f64, offset_y: f64) -> Vec<f32> {
        let (width, height) = (width as usize, height as usize);
        let mut heights = self.heights.generate(width, height, offset_x, offset_y);
        if let Some(lakes) = terrain::Lakes::of(&self.heights) {
            lakes.carve(&mut heights, width, height, offset_x, offset_y);
        }
        heights
    }

    /// The un-eroded, uncarved ground at lake-space (u, v).
    pub fn ground(&self, u: f64, v: f64) -> f64 {
        self.heights.sample(u, v).height
    }

    /// The biomes at lake-space (u, v), as a chunk resolves them, into
    /// `biomes` and `weights`; returns how many. `maskWeights` is the painted
    /// biome mask of the chunk there, if any (empty for none), and (`localX`,
    /// `localY`) the point's sample in that chunk. Each output holds the
    /// climate's biome count plus four.
    #[wasm_bindgen(js_name = biomesAt)]
    #[allow(clippy::too_many_arguments)]
    pub fn biomes_at(
        &self,
        u: f64,
        v: f64,
        mask_weights: &[u8],
        mask_size: u32,
        mask_step: u32,
        local_x: f64,
        local_y: f64,
        biomes: &mut [i32],
        weights: &mut [f64],
    ) -> usize {
        let mask = (!mask_weights.is_empty()).then(|| terrain::PaintMask {
            size: mask_size as usize,
            step: mask_step as f64,
            channels: mask_weights.len() / (mask_size * mask_size) as usize,
            weights: mask_weights,
        });
        let climate = self.heights.climate();
        let mut active = terrain::paint::ActiveBiomes::new(climate, mask.as_ref());
        active.resolve(climate, &self.heights.climate_at(u, v), mask.as_ref(), local_x, local_y);
        for i in 0..active.count {
            biomes[i] = active.biomes[i] as i32;
            weights[i] = active.weights[i];
        }
        active.count
    }

    /// Every lake whose bank reaches the lake-space box [u0, u1] × [v0, v1],
    /// as `Lake` records.
    pub fn lakes(&self, u0: f64, v0: f64, u1: f64, v1: f64) -> Result<JsValue, JsError> {
        let lakes = terrain::Lakes::of(&self.heights).map_or_else(Vec::new, |l| l.find(u0, v0, u1, v1));
        to_js(&lakes)
    }

    /// What every lake cell overlapping the lake-space box did, as
    /// `LakeCellReport` records. Slow; for debugging.
    #[wasm_bindgen(js_name = inspectLakes)]
    pub fn inspect_lakes(&self, u0: f64, v0: f64, u1: f64, v1: f64) -> Result<JsValue, JsError> {
        let reports = terrain::Lakes::of(&self.heights).map_or_else(Vec::new, |l| l.inspect(u0, v0, u1, v1));
        to_js(&reports)
    }

    /// The water of a `chunkSize` chunk at chunk offset (`offsetX`,
    /// `offsetY`), one texel every `step` samples, with `edit` over it.
    pub fn water(
        &self,
        chunk_size: u32,
        step: u32,
        offset_x: f64,
        offset_y: f64,
        edit: Option<WaterEditData>,
    ) -> ResolvedWaterBuild {
        ResolvedWaterBuild(terrain::water::resolve(
            &self.heights,
            chunk_size as usize,
            step as usize,
            offset_x,
            offset_y,
            edit.map(|e| e.0),
        ))
    }

    /// The water map of a chunk with LOD-0 `heights`, or undefined where no
    /// water comes near the ground. See `terrain::water::build_map`.
    #[wasm_bindgen(js_name = waterMap)]
    pub fn water_map(
        &self,
        chunk_size: u32,
        step: u32,
        offset_x: f64,
        offset_y: f64,
        heights: &[f32],
        edit: Option<WaterEditData>,
    ) -> Option<WaterMapBuild> {
        terrain::water::build_map(
            &self.heights,
            chunk_size as usize,
            step as usize,
            offset_x,
            offset_y,
            heights,
            edit.map(|e| e.0),
        )
        .map(WaterMapBuild)
    }

    /// Every scatter instance a `chunkSize` chunk at chunk offset (`offsetX`,
    /// `offsetY`) with LOD-0 `heights` carries. See
    /// `terrain::ScatterGenerator::generate`.
    pub fn scatter(
        &self,
        heights: &[f32],
        chunk_size: u32,
        offset_x: f64,
        offset_y: f64,
        request: ScatterRequestData,
    ) -> Result<ScatterBuild, JsError> {
        let request_data = request;
        let request = terrain::ScatterRequest {
            biome_mask: request_data.biome_mask.as_ref().map(OwnedMask::view),
            density_mask: request_data.density_mask.as_ref().map(OwnedMask::view),
            kills: &request_data.kills,
            region: request_data.region,
            with_ids: request_data.with_ids,
            water_edit: request_data.water_edit,
        };
        self.scatter
            .generate(&self.heights, heights, chunk_size as usize, offset_x, offset_y, request)
            .map(ScatterBuild)
            .map_err(|e| JsError::new(&e))
    }

    /// Writes the inclusive texel window (`x0`, `y0`)–(`x1`, `y1`) of a chunk's
    /// splat map into `out`, which holds the whole map. `maskWeights` is the
    /// chunk's painted biome mask, if any, with its `maskSize` and `maskStep`.
    /// See `terrain::SplatGenerator::generate`.
    #[allow(clippy::too_many_arguments)]
    pub fn splat(
        &self,
        heights: &[f32],
        width: u32,
        height: u32,
        offset_x: f64,
        offset_y: f64,
        mask_weights: Option<Vec<u8>>,
        mask_size: u32,
        mask_step: u32,
        x0: u32,
        y0: u32,
        x1: u32,
        y1: u32,
        out: &mut [u8],
    ) {
        let mask = mask_weights.as_deref().map(|weights| terrain::PaintMask {
            size: mask_size as usize,
            step: mask_step as f64,
            channels: weights.len() / (mask_size * mask_size) as usize,
            weights,
        });
        let region = terrain::Region {
            x0: x0 as usize,
            y0: y0 as usize,
            x1: x1 as usize,
            y1: y1 as usize,
        };
        self.splat.generate(
            heights,
            width as usize,
            height as usize,
            offset_x,
            offset_y,
            mask.as_ref(),
            region,
            out,
        );
    }
}

/// A patch of LOD-0 heights over world samples from (`x0`, `z0`), `width` a
/// row, for one brush edit. See `terrain::edit::Patch`.
#[allow(clippy::too_many_arguments)]
fn edit_patch<'a>(
    heights: &'a mut [f32],
    flags: &'a [u8],
    x0: i32,
    z0: i32,
    width: u32,
    span: u32,
    meters_per_sample: f64,
    planes: &[usize],
) -> Result<terrain::edit::Patch<'a>, JsError> {
    let width = width as usize;
    if !heights.len().is_multiple_of(width) || flags.len() != heights.len() {
        return Err(JsError::new("Patch heights and flags do not fill whole rows."));
    }
    if planes.iter().any(|&len| len != heights.len()) {
        return Err(JsError::new("Patch planes do not match its heights."));
    }
    if span == 0 || !span.is_multiple_of(2) {
        return Err(JsError::new(&format!("A chunk span of {span} samples is not even.")));
    }
    Ok(terrain::edit::Patch { heights, flags, x0, z0, width, span: span as i32, meters_per_sample })
}

fn texel_grid<T>(values: &[T], i0: i32, j0: i32, width: u32, step: u32) -> Result<terrain::edit::TexelGrid<'_, T>, JsError> {
    if !values.len().is_multiple_of(width as usize) || step == 0 {
        return Err(JsError::new("Texel grid values do not fill whole rows."));
    }
    Ok(terrain::edit::TexelGrid { values, i0, j0, width: width as usize, step: step as i32 })
}

/// Applies a sculpt stamp to a patch and returns the (cx, cy) of each chunk it
/// changed. `brush` is a `SculptBrushType`. `baseline` holds the generated
/// heights over the patch for `'reset'`, and may be empty otherwise.
/// `target` is the flatten height and `kernel` the smooth half-width. See
/// `terrain::edit::sculpt`.
#[wasm_bindgen(js_name = sculptStamp)]
#[allow(clippy::too_many_arguments)]
pub fn sculpt_stamp(
    heights: &mut [f32],
    flags: &[u8],
    x0: i32,
    z0: i32,
    width: u32,
    span: u32,
    meters_per_sample: f64,
    baseline: &[f32],
    brush: &str,
    centre_x: f64,
    centre_z: f64,
    radius: f64,
    amount: f64,
    target: f64,
    kernel: u32,
) -> Result<Vec<i32>, JsError> {
    use terrain::edit::Brush;
    let brush = match brush {
        "raise" => Brush::Raise,
        "lower" => Brush::Lower,
        "smooth" => Brush::Smooth { kernel: kernel as usize },
        "flatten" => Brush::Flatten { target },
        "reset" => Brush::Reset,
        other => return Err(JsError::new(&format!("unknown sculpt brush '{other}'"))),
    };
    let planes: &[usize] = if matches!(brush, Brush::Reset) { &[baseline.len()] } else { &[] };
    let mut patch = edit_patch(heights, flags, x0, z0, width, span, meters_per_sample, planes)?;
    let stamp = terrain::edit::SculptStamp { brush, centre_x, centre_z, radius, amount };
    Ok(terrain::edit::sculpt(&mut patch, &stamp, baseline).chunks())
}

/// Digs a patch toward a water stroke's bed and returns the (cx, cy) of each
/// chunk it changed. `guard` is the stroke's `WaterGuard` over world texels
/// from (`guardI0`, `guardJ0`), one every `step` samples, and `texel` a
/// texel's width in metres. See `terrain::edit::carve`.
#[wasm_bindgen(js_name = carveStamp)]
#[allow(clippy::too_many_arguments)]
pub fn carve_stamp(
    heights: &mut [f32],
    flags: &[u8],
    x0: i32,
    z0: i32,
    width: u32,
    span: u32,
    meters_per_sample: f64,
    originals: &[f32],
    targets: &mut [f32],
    guard: &[u8],
    guard_i0: i32,
    guard_j0: i32,
    guard_width: u32,
    step: u32,
    texel: f64,
    centre_x: f64,
    centre_z: f64,
    radius: f64,
    level: f64,
    depth: f64,
    blend: f64,
) -> Result<Vec<i32>, JsError> {
    let planes = [originals.len(), targets.len()];
    let mut patch = edit_patch(heights, flags, x0, z0, width, span, meters_per_sample, &planes)?;
    let guard = texel_grid(guard, guard_i0, guard_j0, guard_width, step)?;
    let carve = terrain::edit::Carve { centre_x, centre_z, radius, level, depth, blend };
    let shore = terrain::edit::Shore::new(texel);
    Ok(terrain::edit::carve(&mut patch, &carve, &guard, originals, targets, &shore).chunks())
}

/// Raises the lip of an add stroke over a patch and returns the (cx, cy) of
/// each chunk it changed. `wet` and `own` are the planes of its `ShoreGrid`.
/// See `terrain::edit::lip`.
#[wasm_bindgen(js_name = waterLip)]
#[allow(clippy::too_many_arguments)]
pub fn water_lip(
    heights: &mut [f32],
    flags: &[u8],
    x0: i32,
    z0: i32,
    width: u32,
    span: u32,
    meters_per_sample: f64,
    originals: &[f32],
    discs: &[f64],
    wet: &[u8],
    own: &[u8],
    grid_i0: i32,
    grid_j0: i32,
    grid_width: u32,
    step: u32,
    texel: f64,
    level: f64,
    height: f64,
) -> Result<Vec<i32>, JsError> {
    let mut patch = edit_patch(heights, flags, x0, z0, width, span, meters_per_sample, &[originals.len()])?;
    let wet = texel_grid(wet, grid_i0, grid_j0, grid_width, step)?;
    let own = texel_grid(own, grid_i0, grid_j0, grid_width, step)?;
    let shore = terrain::edit::Shore::new(texel);
    Ok(terrain::edit::lip(&mut patch, discs, &wet, &own, originals, level, height, &shore).chunks())
}

/// Raises the bank of a remove stroke over a patch and returns the (cx, cy) of
/// each chunk it changed. `levels` and `covered` are the planes of its
/// `CutGrid`. See `terrain::edit::cut_bank`.
#[wasm_bindgen(js_name = cutBank)]
#[allow(clippy::too_many_arguments)]
pub fn cut_bank(
    heights: &mut [f32],
    flags: &[u8],
    x0: i32,
    z0: i32,
    width: u32,
    span: u32,
    meters_per_sample: f64,
    discs: &[f64],
    levels: &[f32],
    covered: &[u8],
    grid_i0: i32,
    grid_j0: i32,
    grid_width: u32,
    step: u32,
    texel: f64,
    height: f64,
) -> Result<Vec<i32>, JsError> {
    let mut patch = edit_patch(heights, flags, x0, z0, width, span, meters_per_sample, &[])?;
    let levels = texel_grid(levels, grid_i0, grid_j0, grid_width, step)?;
    let covered = texel_grid(covered, grid_i0, grid_j0, grid_width, step)?;
    if covered.values.len() != levels.values.len() {
        return Err(JsError::new("Cut grid planes differ in size."));
    }
    let shore = terrain::edit::Shore::new(texel);
    Ok(terrain::edit::cut_bank(&mut patch, discs, &levels, &covered, height, &shore).chunks())
}
