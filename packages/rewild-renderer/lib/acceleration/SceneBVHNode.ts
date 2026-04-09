import { Box3 } from 'rewild-common';
import { Transform } from '../core/Transform';

/**
 * A node in the scene-level BVH tree. Internal nodes have two children;
 * leaf nodes hold references to Transform objects.
 */
export class SceneBVHNode {
  boundingBox: Box3;
  leftChild: SceneBVHNode | null = null;
  rightChild: SceneBVHNode | null = null;

  /** Whether this is a leaf node containing object references. */
  isLeaf: boolean = false;

  /** Transform objects stored in leaf nodes. */
  objects: Transform[] = [];

  constructor() {
    this.boundingBox = new Box3();
  }
}
