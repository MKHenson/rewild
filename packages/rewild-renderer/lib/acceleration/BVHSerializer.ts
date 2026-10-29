import { BVHNode } from './BVHNode';

/**
 * Flat BVH layout written by the Rust builder (BVHWasm), so a tree can be
 * transferred between a Web Worker and the main thread via `postMessage`.
 *
 * Layout per node (11 floats, stride = FLOATS_PER_NODE):
 *   [0]  isLeaf           (0.0 or 1.0)
 *   [1]  boundingBox.min.x
 *   [2]  boundingBox.min.y
 *   [3]  boundingBox.min.z
 *   [4]  boundingBox.max.x
 *   [5]  boundingBox.max.y
 *   [6]  boundingBox.max.z
 *   [7]  triangleOffset
 *   [8]  triangleCount
 *   [9]  leftChildIndex   (-1 if null)
 *   [10] rightChildIndex  (-1 if null)
 */
const FLOATS_PER_NODE = 11;

/**
 * Serialised BVH payload that can be transferred via `postMessage`.
 * All fields are transferable typed arrays.
 */
export interface SerializedBVH {
  /** Flat node data (see layout above). */
  nodes: Float32Array;
  /** Total number of nodes in the tree. */
  nodeCount: i32;
  /** Reordered triangle index buffer produced by the builder. */
  triIndices: Uint32Array;
}

/**
 * Reconstruct a BVH tree from the flat serialised representation.
 * Returns the root `BVHNode`.
 */
export function deserializeBVH(data: SerializedBVH): BVHNode {
  const { nodes, nodeCount } = data;
  const pool: BVHNode[] = new Array(nodeCount);

  // First pass: create all nodes and set scalar properties.
  for (let i = 0; i < nodeCount; i++) {
    const offset = i * FLOATS_PER_NODE;
    const node = new BVHNode();
    node.isLeaf = nodes[offset] === 1.0;
    node.boundingBox.min.set(
      nodes[offset + 1],
      nodes[offset + 2],
      nodes[offset + 3]
    );
    node.boundingBox.max.set(
      nodes[offset + 4],
      nodes[offset + 5],
      nodes[offset + 6]
    );
    node.triangleOffset = nodes[offset + 7];
    node.triangleCount = nodes[offset + 8];
    pool[i] = node;
  }

  // Second pass: link children.
  for (let i = 0; i < nodeCount; i++) {
    const offset = i * FLOATS_PER_NODE;
    const leftIdx = nodes[offset + 9];
    const rightIdx = nodes[offset + 10];

    if (leftIdx >= 0) pool[i].leftChild = pool[leftIdx];
    if (rightIdx >= 0) pool[i].rightChild = pool[rightIdx];
  }

  return pool[0];
}
