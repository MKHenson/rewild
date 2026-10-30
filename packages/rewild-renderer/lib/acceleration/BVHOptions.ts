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
