//! Chunk meshes: one vertex every LOD step over a height field, skirts that
//! hide the cracks between neighbouring LODs, and normals from the
//! full-resolution gradient. A port of `generateTerrainMesh` in
//! `MeshGenerator.ts`.
//!
//! The grid is centred on the chunk. +x follows the samples' x, and +z runs
//! against their y, so sample row 0 is the chunk's +z edge.

/// A chunk mesh. Surface vertices come first, row by row, then the skirts'.
pub struct Mesh {
    /// xyz per vertex, in world units.
    pub vertices: Vec<f32>,
    /// uv per vertex, 0..1 across the chunk.
    pub uvs: Vec<f32>,
    /// Unit xyz per vertex.
    pub normals: Vec<f32>,
    pub indices: Vec<u32>,
}

/// Samples between vertices at `lod`.
pub fn lod_step(lod: u32) -> usize {
    if lod == 0 {
        1
    } else {
        lod as usize * 2
    }
}

/// The mesh of a `size` × `size` chunk at `lod`.
///
/// `heights` holds the chunk's samples inside `apron` rings of its
/// neighbours', (size + 2·apron)² in all. With a ring, edge normals take a
/// two-sided difference and match the neighbour chunk's; without one they fall
/// back to one-sided. `horizontal_scale` is world units per sample.
pub fn build(heights: &[f32], size: usize, apron: usize, lod: u32, horizontal_scale: f64) -> Result<Mesh, String> {
    let step = lod_step(lod);
    let field = size + 2 * apron;
    if size < 2 || !(size - 1).is_multiple_of(step) {
        return Err(format!("A {size}-sample chunk has no whole LOD {lod} grid."));
    }
    if horizontal_scale.is_nan() || horizontal_scale <= 0.0 {
        return Err("The mesh's horizontal scale must be a positive number.".into());
    }
    if heights.len() != field * field {
        return Err(format!("The mesh needs {} heights, got {}.", field * field, heights.len()));
    }

    let vpl = (size - 1) / step + 1;
    let surface = vpl * vpl;
    let vertex_count = surface + 4 * vpl;
    let mut mesh = Mesh {
        vertices: Vec::with_capacity(vertex_count * 3),
        uvs: Vec::with_capacity(vertex_count * 2),
        normals: Vec::with_capacity(vertex_count * 3),
        indices: Vec::with_capacity(((vpl - 1) * (vpl - 1) + 4 * (vpl - 1)) * 6),
    };
    let top_left = (size - 1) as f64 / 2.0;
    let span = (size - 1) as f64;
    let at = |x: usize, y: usize| heights[y * field + x] as f64;

    for gy in 0..vpl {
        for gx in 0..vpl {
            let (sx, sy) = (gx * step, gy * step);
            mesh.vertices.extend_from_slice(&[
                ((sx as f64 - top_left) * horizontal_scale) as f32,
                heights[(sy + apron) * field + sx + apron],
                ((top_left - sy as f64) * horizontal_scale) as f32,
            ]);
            mesh.uvs.extend_from_slice(&[(sx as f64 / span) as f32, (sy as f64 / span) as f32]);

            // Every LOD shades from the full-resolution gradient, not its own
            // facets, so neighbouring chunks and LODs agree on shared normals.
            let (fx, fy) = (sx + apron, sy + apron);
            let (xl, xr) = (fx.saturating_sub(1), (fx + 1).min(field - 1));
            let (yd, yu) = (fy.saturating_sub(1), (fy + 1).min(field - 1));
            let nx = at(xl, fy) - at(xr, fy);
            let nz = at(fx, yu) - at(fx, yd);
            let ny = 2.0 * horizontal_scale;
            let length = (nx * nx + ny * ny + nz * nz).sqrt();
            mesh.normals.extend_from_slice(&[(nx / length) as f32, (ny / length) as f32, (nz / length) as f32]);

            if gx < vpl - 1 && gy < vpl - 1 {
                let v = (gy * vpl + gx) as u32;
                let below = v + vpl as u32;
                mesh.indices.extend_from_slice(&[v, below + 1, below, below + 1, v, v + 1]);
            }
        }
    }

    // Each skirt hangs below one edge, its vertices copying the edge's uv and
    // normal so it shades as the surface does. `flip` keeps it facing out.
    let depth = (step as f64 * 0.2).max(0.2);
    let mut skirt = |edge: &dyn Fn(usize) -> usize, flip: bool| {
        let first = (mesh.vertices.len() / 3) as u32;
        for i in 0..vpl {
            let e = edge(i);
            let (x, y, z) = (mesh.vertices[e * 3], mesh.vertices[e * 3 + 1], mesh.vertices[e * 3 + 2]);
            mesh.vertices.extend_from_slice(&[x, (y as f64 - depth) as f32, z]);
            mesh.uvs.extend_from_slice(&[mesh.uvs[e * 2], mesh.uvs[e * 2 + 1]]);
            mesh.normals.extend_from_slice(&[mesh.normals[e * 3], mesh.normals[e * 3 + 1], mesh.normals[e * 3 + 2]]);
        }
        for i in 0..vpl - 1 {
            let (a, b) = (edge(i) as u32, edge(i + 1) as u32);
            let (sa, sb) = (first + i as u32, first + i as u32 + 1);
            if flip {
                mesh.indices.extend_from_slice(&[a, b, sa, b, sb, sa]);
            } else {
                mesh.indices.extend_from_slice(&[a, sa, b, b, sa, sb]);
            }
        }
    };
    let last = vpl - 1;
    skirt(&|gx| gx, false);
    skirt(&|gx| last * vpl + gx, true);
    skirt(&|gy| gy * vpl, true);
    skirt(&|gy| gy * vpl + last, false);
    Ok(mesh)
}
