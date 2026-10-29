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

/// Terrain heights for one world. Build once per climate preset, seed and sea
/// level, then generate chunks and sample points from it.
#[wasm_bindgen]
pub struct TerrainHeights {
    generator: terrain::HeightGenerator,
}

#[wasm_bindgen]
impl TerrainHeights {
    /// `climate` is a `ClimateConfig`. Throws if the preset is invalid.
    #[wasm_bindgen(constructor)]
    pub fn new(
        climate: JsValue,
        seed: f64,
        sea_level: f64,
        meters_per_sample: f64,
    ) -> Result<TerrainHeights, JsError> {
        let climate: terrain::ClimateConfig =
            serde_wasm_bindgen::from_value(climate).map_err(|e| JsError::new(&e.to_string()))?;
        let generator = terrain::HeightGenerator::new(climate, seed, sea_level, meters_per_sample)
            .map_err(|e| JsError::new(&e))?;
        Ok(TerrainHeights { generator })
    }

    /// A `width` × `height` field at chunk offset (`offsetX`, `offsetY`),
    /// before lakes are carved. See `terrain::HeightGenerator::generate`.
    pub fn generate(&self, width: u32, height: u32, offset_x: f64, offset_y: f64) -> Vec<f32> {
        self.generator.generate(width as usize, height as usize, offset_x, offset_y)
    }

    /// The un-eroded, uncarved ground at lake-space (u, v).
    pub fn ground(&self, u: f64, v: f64) -> f64 {
        self.generator.sample(u, v).height
    }

    /// The continent field at lake-space (u, v).
    pub fn continent(&self, u: f64, v: f64) -> f64 {
        self.generator.continent(u, v)
    }
}
