import { BVHNode } from './BVHNode';

/** Count total nodes in the BVH tree. */
export function countNodes(node: BVHNode | null): i32 {
  if (!node) return 0;
  return 1 + countNodes(node.leftChild) + countNodes(node.rightChild);
}

/** Count leaf nodes in the BVH tree. */
export function countLeaves(node: BVHNode | null): i32 {
  if (!node) return 0;
  if (node.isLeaf) return 1;
  return countLeaves(node.leftChild) + countLeaves(node.rightChild);
}

/** Get the maximum depth of the BVH tree. */
export function getMaxDepth(node: BVHNode | null): i32 {
  if (!node) return 0;
  return (
    1 + Math.max(getMaxDepth(node.leftChild), getMaxDepth(node.rightChild))
  );
}
