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
