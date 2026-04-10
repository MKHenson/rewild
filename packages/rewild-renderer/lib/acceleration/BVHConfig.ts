import { BVHStrategy } from './BVHNode';

/**
 * Global configuration for BVH acceleration structures.
 *
 * Set on the Renderer and automatically applied when geometries are built
 * and during the render loop.
 */
export interface BVHConfig {
  // ── Per-geometry BVH ──

  /**
   * Automatically compute a BVH when a geometry is built (GPU upload)
   * and its triangle count exceeds `autoComputeThreshold`.
   */
  autoComputeGeometryBVH: boolean;

  /**
   * Triangle count above which `build()` auto-triggers `computeBVH()`.
   * Only used when `autoComputeGeometryBVH` is true.
   * Default: 1000.
   */
  autoComputeThreshold: i32;

  /** Default split strategy for auto-computed geometry BVHs. */
  geometryBVHStrategy: BVHStrategy;

  /** Maximum tree depth for geometry BVHs. */
  geometryBVHMaxDepth: i32;

  /** Maximum triangles per leaf node for geometry BVHs. */
  geometryBVHMaxLeafTriangles: i32;

  // ── Async (worker) builds ──

  /**
   * Triangle count above which BVH construction is offloaded to a
   * Web Worker to avoid blocking the main thread.
   * Geometries below this threshold are built synchronously.
   * Default: 10000.
   */
  asyncBuildThreshold: i32;

  // ── Scene BVH ──

  /** Create a SceneBVH and attach it to the Renderer. */
  enableSceneBVH: boolean;

  /** Automatically call `sceneBVH.update()` each frame. */
  sceneBVHAutoUpdate: boolean;

  /**
   * Fraction of moved objects that triggers a full scene BVH rebuild
   * instead of a cheaper refit. Range 0–1. Default: 0.1 (10%).
   */
  sceneBVHUpdateThreshold: f32;

  // ── Dynamic refit ──

  /**
   * Automatically refit per-geometry BVHs in the render loop when
   * `geometry.bvhNeedsUpdate` is true.
   */
  autoRefitGeometryBVH: boolean;
}

export const DEFAULT_BVH_CONFIG: BVHConfig = {
  autoComputeGeometryBVH: true,
  autoComputeThreshold: 1000,
  geometryBVHStrategy: 'sah',
  geometryBVHMaxDepth: 32,
  geometryBVHMaxLeafTriangles: 8,
  asyncBuildThreshold: 10000,
  enableSceneBVH: true,
  sceneBVHAutoUpdate: true,
  sceneBVHUpdateThreshold: 0.1,
  autoRefitGeometryBVH: true,
};
