import { buildBvh } from '../../../rewild-wasm/pkg/rewild_wasm';
import { BVHOptions } from './BVHNode';
import { SerializedBVH } from './BVHSerializer';

/**
 * Builds a BVH with the Rust builder (packages/rewild-wasm/crates/bvh). The
 * module must be loaded first (see RewildWasm).
 *
 * Returns the same flat layout as `serializeBVH`, so `deserializeBVH` reads it
 * unchanged. The tree can differ from the JS builder's, but it is a valid BVH
 * of the same triangles (see BVHWasm.spec.ts).
 */
export function buildBVHWasm(
  vertices: Float32Array,
  indices: Uint32Array | undefined,
  options: BVHOptions
): SerializedBVH {
  const built = buildBvh(
    vertices,
    indices,
    options.strategy,
    options.maxDepth,
    options.maxLeafTriangles
  );
  try {
    return {
      nodeCount: built.nodeCount,
      nodes: built.takeNodes(),
      triIndices: built.takeTriIndices(),
    };
  } finally {
    built.free();
  }
}
