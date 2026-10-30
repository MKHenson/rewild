import { Ray, Triangle, Vector3 } from 'rewild-common';
import { Geometry } from '../geometry/Geometry';
import { Intersection, Face } from '../core/Raycaster';
import { BVHOptions, DEFAULT_BVH_OPTIONS } from './BVHOptions';
import { BVHTree } from './BVHTree';
import { BVHWorkerManager } from './BVHWorkerManager';
import { buildBVHWasm, refitBVHWasm } from './BVHWasm';

const _vA = new Vector3();
const _vB = new Vector3();
const _vC = new Vector3();
const _hitPoint = new Vector3();

/**
 * BVH acceleration structure for per-geometry raycasting.
 *
 * Lives as an optional property on Geometry (`geometry.bvh`).
 * Multiple Mesh instances sharing the same Geometry share the BVH.
 *
 * Usage:
 * ```
 * const bvh = new BVH(geometry, { strategy: 'sah' });
 * // Then in Mesh.raycast(), check geometry.bvh before brute-force.
 * ```
 */
export class BVH {
  tree!: BVHTree;
  options!: BVHOptions;

  /** Reordered triangle indices matching leaf node ranges. */
  triIndices!: Uint32Array;

  /** Reference to the source geometry's vertex buffer. */
  private vertices!: Float32Array;

  /** True when the tree is built and ready for queries. */
  isReady!: boolean;

  /**
   * Nodes a traversal has still to visit, and for raycastFirst the distance
   * at which the ray enters each. A traversal keeps at most one per level.
   */
  private stack!: Int32Array;
  private stackEntry!: Float64Array;

  /** The closest hit so far of a raycastFirst. */
  private closestDistance!: f32;
  private closestTriangle!: i32;

  /**
   * Build a BVH synchronously with the Rust builder. Suitable for small/medium
   * geometries. The WASM module must be loaded (see RewildWasm).
   */
  constructor(geometry: Geometry, options?: Partial<BVHOptions>) {
    const merged = { ...DEFAULT_BVH_OPTIONS, ...options };
    const built = buildBVHWasm(geometry.vertices, geometry.indices, merged);
    this.init(
      geometry.vertices,
      new BVHTree(built.nodes),
      built.triIndices,
      merged
    );
  }

  /**
   * A ready BVH over `vertices` from a tree built elsewhere, such as a
   * worker build. `options` must be the ones the tree was built with.
   */
  static fromTree(
    vertices: Float32Array,
    tree: BVHTree,
    triIndices: Uint32Array,
    options?: Partial<BVHOptions>
  ): BVH {
    const bvh = Object.create(BVH.prototype) as BVH;
    bvh.init(vertices, tree, triIndices, {
      ...DEFAULT_BVH_OPTIONS,
      ...options,
    });
    return bvh;
  }

  private init(
    vertices: Float32Array,
    tree: BVHTree,
    triIndices: Uint32Array,
    options: BVHOptions
  ): void {
    this.options = options;
    this.vertices = vertices;
    this.tree = tree;
    this.triIndices = triIndices;
    this.stack = new Int32Array(options.maxDepth + 1);
    this.stackEntry = new Float64Array(options.maxDepth + 1);
    this.closestDistance = 0;
    this.closestTriangle = -1;
    this.isReady = true;
  }

  /**
   * Build a BVH using a Web Worker. Falls back to a synchronous build if the
   * triangle count is below `asyncThreshold`.
   */
  static async buildAsync(
    geometry: Geometry,
    workerManager: BVHWorkerManager,
    options?: Partial<BVHOptions>,
    asyncThreshold: i32 = 10000
  ): Promise<BVH> {
    const mergedOptions: BVHOptions = { ...DEFAULT_BVH_OPTIONS, ...options };
    const triCount = geometry.indices
      ? (geometry.indices.length / 3) | 0
      : (geometry.vertices.length / 3 / 3) | 0;

    if (triCount < asyncThreshold) {
      // Small geometry — build synchronously.
      return new BVH(geometry, options);
    }

    const built = await workerManager.buildAsync(
      geometry.vertices,
      geometry.indices,
      mergedOptions
    );
    return BVH.fromTree(
      geometry.vertices,
      new BVHTree(built.nodes),
      built.triIndices,
      mergedOptions
    );
  }

  /**
   * Cast a ray against the BVH and collect all intersections.
   *
   * The ray must be in geometry-local space (already transformed by the
   * inverse of the mesh's world matrix). The caller (Mesh.raycast) handles
   * the world-space transform of hit points.
   *
   * @param ray - Ray in local geometry space.
   * @param side - Face culling mode from the material ('ccw', 'cw', or other for double-sided).
   * @param near - Minimum hit distance.
   * @param far - Maximum hit distance.
   * @param intersects - Array to push results into.
   */
  raycast(
    ray: Ray,
    side: GPUFrontFace | string,
    near: f32,
    far: f32,
    intersects: Intersection[]
  ): void {
    if (!this.isReady) return;
    const { tree, stack } = this;
    const { origin, direction } = ray;
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const ix = 1 / direction.x;
    const iy = 1 / direction.y;
    const iz = 1 / direction.z;
    const length = direction.length();

    let top = 0;
    let node = 0;
    while (true) {
      const entry = tree.rayEntry(node, ox, oy, oz, ix, iy, iz);
      if (entry >= 0 && entry * length <= far) {
        if (!tree.isLeaf(node)) {
          stack[top++] = tree.rightChild(node);
          node = tree.leftChild(node);
          continue;
        }
        this.intersectLeafTriangles(node, ray, side, near, far, intersects);
      }
      if (top === 0) return;
      node = stack[--top];
    }
  }

  /**
   * Cast a ray and return only the closest hit (early termination).
   */
  raycastFirst(
    ray: Ray,
    side: GPUFrontFace | string,
    near: f32,
    far: f32
  ): Intersection | null {
    if (!this.isReady) return null;
    const { tree, stack, stackEntry } = this;
    const { origin, direction } = ray;
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const ix = 1 / direction.x;
    const iy = 1 / direction.y;
    const iz = 1 / direction.z;
    const length = direction.length();

    this.closestDistance = far;
    this.closestTriangle = -1;

    let top = 0;
    let node = 0;
    let entry = tree.rayEntry(0, ox, oy, oz, ix, iy, iz) * length;
    while (true) {
      if (entry >= 0 && entry <= this.closestDistance) {
        if (tree.isLeaf(node)) {
          this.intersectLeafFirst(node, ray, side, near);
        } else {
          // Visit the child the ray enters first, so a near hit can prune
          // the other.
          const left = tree.leftChild(node);
          const right = tree.rightChild(node);
          const leftEntry =
            tree.rayEntry(left, ox, oy, oz, ix, iy, iz) * length;
          const rightEntry =
            tree.rayEntry(right, ox, oy, oz, ix, iy, iz) * length;
          const leftFirst =
            leftEntry >= 0 && (rightEntry < 0 || leftEntry <= rightEntry);
          const secondEntry = leftFirst ? rightEntry : leftEntry;
          if (secondEntry >= 0) {
            stack[top] = leftFirst ? right : left;
            stackEntry[top++] = secondEntry;
          }
          const firstEntry = leftFirst ? leftEntry : rightEntry;
          if (firstEntry >= 0) {
            node = leftFirst ? left : right;
            entry = firstEntry;
            continue;
          }
        }
      }
      if (top === 0) break;
      node = stack[--top];
      entry = stackEntry[top];
    }

    const t = this.closestTriangle;
    if (t < 0) return null;

    // Re-intersect the winning triangle to get the exact hit point.
    this.loadTriangle(t);
    this.intersectTriangle(ray, side, _vA, _vB, _vC, _hitPoint);
    return this.createIntersection(t, this.closestDistance, _hitPoint);
  }

  /**
   * Refit the BVH after geometry vertices have been modified.
   * Much faster than a full rebuild when only positions change,
   * not topology.
   */
  refit(): void {
    refitBVHWasm(this.tree.words, this.vertices, this.triIndices);
  }

  /**
   * Points the BVH at a replacement vertex array with identical topology
   * (same triangle count and ordering — only positions moved) and refits
   * every node's bounds in place. Lets a rebuilt mesh (e.g. a sculpted
   * terrain chunk) inherit its predecessor's tree instead of queueing a
   * full rebuild in the BVH worker.
   */
  rebind(vertices: Float32Array): void {
    this.vertices = vertices;
    this.refit();
  }

  /** Test all triangles in a leaf node, pushing hits into intersects. */
  private intersectLeafTriangles(
    node: i32,
    ray: Ray,
    side: GPUFrontFace | string,
    near: f32,
    far: f32,
    intersects: Intersection[]
  ): void {
    const start = this.tree.triangleOffset(node);
    const end = start + this.tree.triangleCount(node);

    for (let t = start; t < end; t++) {
      this.loadTriangle(t);
      const hit = this.intersectTriangle(ray, side, _vA, _vB, _vC, _hitPoint);
      if (hit === null) continue;

      const distance = ray.origin.distanceTo(hit);
      if (distance < near || distance > far) continue;

      intersects.push(this.createIntersection(t, distance, hit));
    }
  }

  /** Tests all triangles in a leaf against the closest hit so far. */
  private intersectLeafFirst(
    node: i32,
    ray: Ray,
    side: GPUFrontFace | string,
    near: f32
  ): void {
    const start = this.tree.triangleOffset(node);
    const end = start + this.tree.triangleCount(node);

    for (let t = start; t < end; t++) {
      this.loadTriangle(t);
      const hit = this.intersectTriangle(ray, side, _vA, _vB, _vC, _hitPoint);
      if (hit === null) continue;

      const distance = ray.origin.distanceTo(hit);
      if (distance < near || distance > this.closestDistance) continue;

      this.closestDistance = distance;
      this.closestTriangle = t;
    }
  }

  /** Loads triangle `t`'s corners into _vA, _vB and _vC. */
  private loadTriangle(t: i32): void {
    const { triIndices, vertices } = this;
    _vA.fromBuffer(triIndices[t * 3] * 3, vertices);
    _vB.fromBuffer(triIndices[t * 3 + 1] * 3, vertices);
    _vC.fromBuffer(triIndices[t * 3 + 2] * 3, vertices);
  }

  /** A hit on triangle `t`, whose corners are loaded. */
  private createIntersection(
    t: i32,
    distance: f32,
    point: Vector3
  ): Intersection {
    const intersection = new Intersection();
    intersection.distance = distance;
    intersection.point = point.clone();
    intersection.faceIndex = t;

    const face = new Face();
    face.a = this.triIndices[t * 3];
    face.b = this.triIndices[t * 3 + 1];
    face.c = this.triIndices[t * 3 + 2];
    face.normal = new Vector3();
    Triangle.getNormal(_vA, _vB, _vC, face.normal);
    intersection.face = face;
    return intersection;
  }

  /**
   * Intersect a ray with a triangle, respecting face culling.
   * Returns the hit point or null.
   */
  private intersectTriangle(
    ray: Ray,
    side: GPUFrontFace | string,
    a: Vector3,
    b: Vector3,
    c: Vector3,
    target: Vector3
  ): Vector3 | null {
    if (side === 'cw') {
      return ray.intersectTriangle(c, b, a, true, target);
    }
    return ray.intersectTriangle(a, b, c, side === 'ccw', target);
  }
}
