import { BVHNode } from './BVHNode';

/**
 * Flat serialisation format for a BVH tree so it can be transferred
 * between the main thread and a Web Worker via `postMessage`.
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

// ─── Serialise (worker → main) ────────────────────────────────

/**
 * Serialise a BVH tree (root + triIndices) into flat typed arrays
 * suitable for `postMessage` with `Transferable` support.
 */
export function serializeBVH(
  root: BVHNode,
  triIndices: Uint32Array
): SerializedBVH {
  // First pass: count nodes.
  const nodeCount = countNodesForSerialize(root);
  const nodes = new Float32Array(nodeCount * FLOATS_PER_NODE);

  // Second pass: write nodes breadth-first so parent indices are always < child indices.
  let nextIndex = 0;
  const queue: { node: BVHNode; arrayIndex: i32 }[] = [];

  // Reserve slot 0 for root.
  const rootIdx = nextIndex++;
  queue.push({ node: root, arrayIndex: rootIdx });

  while (queue.length > 0) {
    const { node, arrayIndex } = queue.shift()!;
    const offset = arrayIndex * FLOATS_PER_NODE;

    nodes[offset] = node.isLeaf ? 1.0 : 0.0;
    nodes[offset + 1] = node.boundingBox.min.x;
    nodes[offset + 2] = node.boundingBox.min.y;
    nodes[offset + 3] = node.boundingBox.min.z;
    nodes[offset + 4] = node.boundingBox.max.x;
    nodes[offset + 5] = node.boundingBox.max.y;
    nodes[offset + 6] = node.boundingBox.max.z;
    nodes[offset + 7] = node.triangleOffset;
    nodes[offset + 8] = node.triangleCount;

    if (node.leftChild) {
      const leftIdx = nextIndex++;
      nodes[offset + 9] = leftIdx;
      queue.push({ node: node.leftChild, arrayIndex: leftIdx });
    } else {
      nodes[offset + 9] = -1;
    }

    if (node.rightChild) {
      const rightIdx = nextIndex++;
      nodes[offset + 10] = rightIdx;
      queue.push({ node: node.rightChild, arrayIndex: rightIdx });
    } else {
      nodes[offset + 10] = -1;
    }
  }

  return { nodes, nodeCount, triIndices };
}

// ─── Deserialise (main thread) ────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────

function countNodesForSerialize(node: BVHNode): i32 {
  let count = 1;
  if (node.leftChild) count += countNodesForSerialize(node.leftChild);
  if (node.rightChild) count += countNodesForSerialize(node.rightChild);
  return count;
}
