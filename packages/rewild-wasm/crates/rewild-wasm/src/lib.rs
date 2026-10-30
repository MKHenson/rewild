//! The one WASM module the rewild workers load. Each library crate does its
//! work in plain Rust, and this crate only exposes it to JS.

use wasm_bindgen::prelude::*;

/// A built BVH. Take each array once, then call `free()`.
#[wasm_bindgen]
pub struct BvhBuild {
    nodes: Vec<f32>,
    node_count: u32,
    tri_indices: Vec<u32>,
}

#[wasm_bindgen]
impl BvhBuild {
    #[wasm_bindgen(getter, js_name = nodeCount)]
    pub fn node_count(&self) -> u32 {
        self.node_count
    }

    /// The flat node data, in the layout `deserializeBVH` reads. Copied into
    /// a new `Float32Array`. Empty after the first call.
    #[wasm_bindgen(js_name = takeNodes)]
    pub fn take_nodes(&mut self) -> Vec<f32> {
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
        nodes: built.nodes,
        node_count: built.node_count,
        tri_indices: built.tri_indices,
    })
}

/// Terrain generation for one world. Build once per climate preset, seed and
/// sea level, then generate chunks and sample points from it.
#[wasm_bindgen]
pub struct TerrainGenerator {
    heights: terrain::HeightGenerator,
    splat: terrain::SplatGenerator,
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

/// The water of one chunk at any point in it. Call `free()` when done.
#[wasm_bindgen]
pub struct WaterSampler {
    sampler: terrain::WaterSampler,
    last: terrain::WaterPoint,
}

#[wasm_bindgen]
impl WaterSampler {
    /// The water's coverage at chunk sample (x, y), 0..1. The getters read
    /// the rest of the sample. Passes no arrays, so a call allocates nothing.
    pub fn sample(&mut self, x: f64, y: f64) -> f64 {
        self.last = self.sampler.sample(x, y);
        self.last.coverage
    }

    #[wasm_bindgen(getter)]
    pub fn level(&self) -> f64 {
        self.last.level
    }

    #[wasm_bindgen(getter)]
    pub fn ocean(&self) -> f64 {
        self.last.ocean
    }

    #[wasm_bindgen(getter, js_name = bodyId)]
    pub fn body_id(&self) -> u32 {
        self.last.body_id
    }

    /// Weight of water type `index` at the last sample.
    #[wasm_bindgen(js_name = typeWeight)]
    pub fn type_weight(&self, index: usize) -> f64 {
        self.last.types.get(index).copied().unwrap_or(0.0)
    }
}

#[wasm_bindgen]
impl TerrainGenerator {
    /// `climate` is a `ClimateConfig`; `splat` is `{ palette, coastMaterials }`
    /// (see `terrain::SplatSpec`). Throws if either is invalid.
    #[wasm_bindgen(constructor)]
    pub fn new(
        climate: JsValue,
        splat: JsValue,
        seed: f64,
        sea_level: f64,
        meters_per_sample: f64,
    ) -> Result<TerrainGenerator, JsError> {
        let climate: terrain::ClimateConfig = from_js(climate)?;
        let spec: terrain::SplatSpec = from_js(splat)?;
        let heights = terrain::HeightGenerator::new(climate.clone(), seed, sea_level, meters_per_sample)
            .map_err(|e| JsError::new(&e))?;
        let splat = terrain::SplatGenerator::new(climate, &spec, seed, sea_level, meters_per_sample)
            .map_err(|e| JsError::new(&e))?;
        Ok(TerrainGenerator { heights, splat })
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

    /// A sampler over the water of a `chunkSize` chunk at chunk offset
    /// (`offsetX`, `offsetY`), with `edit` over it.
    #[wasm_bindgen(js_name = waterSampler)]
    pub fn water_sampler(&self, chunk_size: u32, offset_x: f64, offset_y: f64, edit: Option<WaterEditData>) -> WaterSampler {
        WaterSampler {
            sampler: terrain::WaterSampler::new(&self.heights, chunk_size as usize, offset_x, offset_y, edit.map(|e| e.0)),
            last: terrain::WaterPoint::default(),
        }
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
