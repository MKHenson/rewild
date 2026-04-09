import { Box3 } from 'rewild-common';

/**
 * A node in the BVH tree. Can be either an internal node with two children,
 * or a leaf node containing triangle references.
 */
export class BVHNode {
  boundingBox: Box3;
  leftChild: BVHNode | null = null;
  rightChild: BVHNode | null = null;

  /** Whether this is a leaf node containing triangles. */
  isLeaf: boolean = false;

  /** Start index into the reordered triangle index array. */
  triangleOffset: i32 = 0;

  /** Number of triangles in this leaf (0 for internal nodes). */
  triangleCount: i32 = 0;

  constructor() {
    this.boundingBox = new Box3();
  }
}

export type BVHStrategy = 'sah' | 'center';

export interface BVHOptions {
  /** Split strategy: 'sah' for better queries, 'center' for faster builds. */
  strategy: BVHStrategy;

  /** Maximum tree depth (default: 32). */
  maxDepth: i32;

  /** Maximum triangles per leaf node (default: 8). */
  maxLeafTriangles: i32;
}

export const DEFAULT_BVH_OPTIONS: BVHOptions = {
  strategy: 'sah',
  maxDepth: 32,
  maxLeafTriangles: 8,
};

/**
 * Centroids and bounding boxes for each triangle, computed once
 * during BVH construction and reused across split evaluations.
 */
export interface TriangleInfo {
  /** Centroid of each triangle (flat xyz, length = triCount * 3). */
  centroids: Float32Array;

  /** AABB min of each triangle (flat xyz, length = triCount * 3). */
  bboxMin: Float32Array;

  /** AABB max of each triangle (flat xyz, length = triCount * 3). */
  bboxMax: Float32Array;
}
