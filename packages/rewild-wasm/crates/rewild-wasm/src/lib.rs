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
    /// `offsetY`), before lakes are carved. See `terrain::HeightGenerator`.
    pub fn heights(&self, width: u32, height: u32, offset_x: f64, offset_y: f64) -> Vec<f32> {
        self.heights.generate(width as usize, height as usize, offset_x, offset_y)
    }

    /// The un-eroded, uncarved ground at lake-space (u, v).
    pub fn ground(&self, u: f64, v: f64) -> f64 {
        self.heights.sample(u, v).height
    }

    /// The continent field at lake-space (u, v).
    pub fn continent(&self, u: f64, v: f64) -> f64 {
        self.heights.continent(u, v)
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
