import { buildBvh, refitBvh } from '../../../rewild-wasm/pkg/rewild_wasm';
import { BVHOptions } from './BVHOptions';

/** A built BVH as transferable typed arrays. */
export interface BuiltBVH {
  /** The nodes, in the layout `BVHTree` reads. */
  nodes: Uint32Array;
  /** Reordered triangle index buffer produced by the builder. */
  triIndices: Uint32Array;
}

/**
 * Builds a BVH with the Rust builder (packages/rewild-wasm/crates/bvh). The
 * module must be loaded first (see RewildWasm).
 */
export function buildBVHWasm(
  vertices: Float32Array,
  indices: Uint32Array | undefined,
  options: BVHOptions
): BuiltBVH {
  const built = buildBvh(
    vertices,
    indices,
    options.strategy,
    options.maxDepth,
    options.maxLeafTriangles
  );
  try {
    return {
      nodes: built.takeNodes(),
      triIndices: built.takeTriIndices(),
    };
  } finally {
    built.free();
  }
}

/**
 * Recomputes the bounds of `nodes` in place after `vertices` move, with the
 * Rust refit. `triIndices` are the tree's reordered triangles.
 */
export function refitBVHWasm(
  nodes: Uint32Array,
  vertices: Float32Array,
  triIndices: Uint32Array
): void {
  refitBvh(nodes, vertices, triIndices);
}
