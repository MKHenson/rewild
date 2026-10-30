import { Box3 } from 'rewild-common';

/**
 * A node in the scene-level BVH tree. Internal nodes have two children;
 * leaf nodes hold the objects inside them.
 */
export class SceneBVHNode {
  boundingBox: Box3;
  leftChild: SceneBVHNode | null = null;
  rightChild: SceneBVHNode | null = null;

  /** Whether this is a leaf node containing object references. */
  isLeaf: boolean = false;

  /** A leaf's objects, as indices into the BVH's object list. */
  indices: number[] = [];

  constructor() {
    this.boundingBox = new Box3();
  }
}
