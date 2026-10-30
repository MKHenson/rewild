import { BVHTree } from './BVHTree';

/** Count leaf nodes in the BVH tree. */
export function countLeaves(tree: BVHTree): i32 {
  let leaves = 0;
  for (let node = 0; node < tree.nodeCount; node++) {
    if (tree.isLeaf(node)) leaves++;
  }
  return leaves;
}

/** Get the maximum depth of the BVH tree, counting the root as 1. */
export function getMaxDepth(tree: BVHTree): i32 {
  if (tree.nodeCount === 0) return 0;
  // Pre-order: a node's depth is one more than its parent's, and the parent
  // is written first.
  const depths = new Int32Array(tree.nodeCount);
  depths[0] = 1;
  let max = 1;
  for (let node = 0; node < tree.nodeCount; node++) {
    if (tree.isLeaf(node)) continue;
    const depth = depths[node] + 1;
    depths[tree.leftChild(node)] = depth;
    depths[tree.rightChild(node)] = depth;
    if (depth > max) max = depth;
  }
  return max;
}
