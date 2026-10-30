import { buildTerrainMesh } from '../../../../rewild-wasm/pkg/rewild_wasm';

// World size of one heightfield sample step. The heightfield is always
// generated at one-sample-per-unit density and the noise is sampled in that
// same (sample) space, so chunks stay byte-identical and seam-free regardless
// of this value — it only stretches the *mesh* horizontally, so a chunk spans
// (samples-1) * this many world units with the same vertex/triangle count.
// 1 = the original 1 unit/sample scale; raise it to enlarge the world without
// spending more polys (at the cost of terrain detail per world unit).
export const TERRAIN_METERS_PER_SAMPLE = 2;

/** A chunk mesh. Surface vertices come first, row by row, then the skirts'. */
export interface TerrainMesh {
  /** xyz per vertex, in world units. */
  vertices: Float32Array;
  /** uv per vertex, 0..1 across the chunk. */
  uvs: Float32Array;
  /** Unit xyz per vertex, from the full-resolution height gradient. */
  normals: Float32Array;
  indices: Uint32Array;
}

/**
 * The mesh of a `size` × `size` chunk at `levelOfDetail`, built in Rust
 * (crates/terrain/src/mesh.rs). Centred on the chunk: +x follows the samples'
 * x and +z runs against their y. Skirts hang below the edges to hide cracks
 * between LODs.
 *
 * `heightmap` holds the chunk's samples inside `apronMargin` rings of the
 * neighbours', (size + 2·apronMargin)² in all. With a ring, edge normals take a
 * two-sided difference and match the neighbour chunk's; at 0 they fall back to
 * one-sided. `horizontalScale` is world units per sample; it stretches only
 * the vertex x/z, so seams hold at any scale.
 */
export function generateTerrainMesh(
  heightmap: Float32Array,
  size: number,
  levelOfDetail: number,
  horizontalScale: number = 1,
  apronMargin: number = 0
): TerrainMesh {
  const built = buildTerrainMesh(
    heightmap,
    size,
    apronMargin,
    levelOfDetail,
    horizontalScale
  );
  const mesh: TerrainMesh = {
    vertices: built.takeVertices(),
    uvs: built.takeUvs(),
    normals: built.takeNormals(),
    indices: built.takeIndices(),
  };
  built.free();
  return mesh;
}
