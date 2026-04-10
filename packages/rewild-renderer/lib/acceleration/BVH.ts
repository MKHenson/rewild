import { Ray, Triangle, Vector3 } from 'rewild-common';
import { Geometry } from '../geometry/Geometry';
import { Intersection, Face } from '../core/Raycaster';
import { BVHNode, BVHOptions, DEFAULT_BVH_OPTIONS } from './BVHNode';
import { BVHBuilder } from './BVHBuilder';
import { BVHWorkerManager } from './BVHWorkerManager';

const _vA = new Vector3();
const _vB = new Vector3();
const _vC = new Vector3();
const _hitPoint = new Vector3();
const _boxTarget = new Vector3();
const _leftCenter = new Vector3();
const _rightCenter = new Vector3();

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
  root: BVHNode;
  options: BVHOptions;

  /** Reordered triangle indices matching leaf node ranges. */
  triIndices: Uint32Array;

  /** Reference to the source geometry's vertex buffer. */
  private vertices: Float32Array;

  /**
   * True when the BVH tree is fully built and ready for queries.
   * False during an async worker build — raycasting falls back to
   * brute-force until this becomes true.
   */
  isReady: boolean = false;

  /**
   * Build a BVH synchronously. Suitable for small/medium geometries.
   */
  constructor(geometry: Geometry, options?: Partial<BVHOptions>) {
    this.options = { ...DEFAULT_BVH_OPTIONS, ...options };
    this.vertices = geometry.vertices;

    const builder = new BVHBuilder(
      geometry.vertices,
      geometry.indices,
      this.options
    );
    this.root = builder.build();
    this.triIndices = builder.triIndices;
    this.isReady = true;
  }

  /**
   * Build a BVH asynchronously using a Web Worker.
   * Returns a BVH instance with `isReady = false` that will be populated
   * when the worker completes. The returned promise resolves when ready.
   *
   * Falls back to synchronous build if the triangle count is below
   * `asyncThreshold`.
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

    // Create a shell BVH that will be populated when the worker finishes.
    const bvh = Object.create(BVH.prototype) as BVH;
    bvh.options = mergedOptions;
    bvh.vertices = geometry.vertices;
    bvh.root = new BVHNode(); // placeholder
    bvh.triIndices = new Uint32Array(0); // placeholder
    bvh.isReady = false;

    const result = await workerManager.buildAsync(
      geometry.vertices,
      geometry.indices,
      mergedOptions
    );

    bvh.root = result.root;
    bvh.triIndices = result.triIndices;
    bvh.isReady = true;

    return bvh;
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
    this.raycastNode(this.root, ray, side, near, far, intersects);
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
    return this.raycastFirstNode(this.root, ray, side, near, far);
  }

  /**
   * Refit the BVH after geometry vertices have been modified.
   * Much faster than a full rebuild when only positions change,
   * not topology.
   */
  refit(): void {
    this.refitNode(this.root);
  }

  private raycastNode(
    node: BVHNode,
    ray: Ray,
    side: GPUFrontFace | string,
    near: f32,
    far: f32,
    intersects: Intersection[]
  ): void {
    // Test ray against node AABB.
    if (!ray.intersectBox(node.boundingBox, _boxTarget)) return;

    // Check the box hit distance is within range.
    const boxDist = ray.origin.distanceTo(_boxTarget);
    if (boxDist > far) return;

    if (node.isLeaf) {
      this.intersectLeafTriangles(node, ray, side, near, far, intersects);
    } else {
      if (node.leftChild) {
        this.raycastNode(node.leftChild, ray, side, near, far, intersects);
      }
      if (node.rightChild) {
        this.raycastNode(node.rightChild, ray, side, near, far, intersects);
      }
    }
  }

  private raycastFirstNode(
    node: BVHNode,
    ray: Ray,
    side: GPUFrontFace | string,
    near: f32,
    far: f32
  ): Intersection | null {
    if (!ray.intersectBox(node.boundingBox, _boxTarget)) return null;
    const boxDist = ray.origin.distanceTo(_boxTarget);
    if (boxDist > far) return null;

    if (node.isLeaf) {
      return this.intersectLeafFirst(node, ray, side, near, far);
    }

    // Traverse closer child first for earlier termination.
    let firstChild = node.leftChild;
    let secondChild = node.rightChild;

    if (firstChild && secondChild) {
      firstChild.boundingBox.getCenter(_leftCenter);
      secondChild.boundingBox.getCenter(_rightCenter);

      const leftDist = ray.origin.distanceToSquared(_leftCenter);
      const rightDist = ray.origin.distanceToSquared(_rightCenter);

      if (rightDist < leftDist) {
        firstChild = node.rightChild;
        secondChild = node.leftChild;
      }
    }

    let closest: Intersection | null = null;
    let currentFar = far;

    if (firstChild) {
      closest = this.raycastFirstNode(firstChild, ray, side, near, currentFar);
      if (closest) {
        currentFar = closest.distance;
      }
    }

    if (secondChild) {
      const hit = this.raycastFirstNode(
        secondChild,
        ray,
        side,
        near,
        currentFar
      );
      if (hit) {
        closest = hit;
      }
    }

    return closest;
  }

  /** Test all triangles in a leaf node, pushing hits into intersects. */
  private intersectLeafTriangles(
    node: BVHNode,
    ray: Ray,
    side: GPUFrontFace | string,
    near: f32,
    far: f32,
    intersects: Intersection[]
  ): void {
    const { triIndices, vertices } = this;
    const end = node.triangleOffset + node.triangleCount;

    for (let t = node.triangleOffset; t < end; t++) {
      const i0 = triIndices[t * 3];
      const i1 = triIndices[t * 3 + 1];
      const i2 = triIndices[t * 3 + 2];

      _vA.fromBuffer(i0 * 3, vertices);
      _vB.fromBuffer(i1 * 3, vertices);
      _vC.fromBuffer(i2 * 3, vertices);

      const hit = this.intersectTriangle(ray, side, _vA, _vB, _vC, _hitPoint);
      if (hit === null) continue;

      const distance = ray.origin.distanceTo(hit);
      if (distance < near || distance > far) continue;

      const intersection = new Intersection();
      intersection.distance = distance;
      intersection.point = hit.clone();
      intersection.faceIndex = t;

      const face = new Face();
      face.a = i0;
      face.b = i1;
      face.c = i2;
      face.normal = new Vector3();
      Triangle.getNormal(_vA, _vB, _vC, face.normal);
      intersection.face = face;

      intersects.push(intersection);
    }
  }

  /** Test all triangles in a leaf, return closest hit only. */
  private intersectLeafFirst(
    node: BVHNode,
    ray: Ray,
    side: GPUFrontFace | string,
    near: f32,
    far: f32
  ): Intersection | null {
    const { triIndices, vertices } = this;
    const end = node.triangleOffset + node.triangleCount;
    let closestDist = far;
    let closestTriIndex = -1;
    let closestI0 = 0;
    let closestI1 = 0;
    let closestI2 = 0;

    for (let t = node.triangleOffset; t < end; t++) {
      const i0 = triIndices[t * 3];
      const i1 = triIndices[t * 3 + 1];
      const i2 = triIndices[t * 3 + 2];

      _vA.fromBuffer(i0 * 3, vertices);
      _vB.fromBuffer(i1 * 3, vertices);
      _vC.fromBuffer(i2 * 3, vertices);

      const hit = this.intersectTriangle(ray, side, _vA, _vB, _vC, _hitPoint);
      if (hit === null) continue;

      const distance = ray.origin.distanceTo(hit);
      if (distance < near || distance > closestDist) continue;

      closestDist = distance;
      closestTriIndex = t;
      closestI0 = i0;
      closestI1 = i1;
      closestI2 = i2;
    }

    if (closestTriIndex === -1) return null;

    // Re-intersect the winning triangle to get the exact hit point.
    _vA.fromBuffer(closestI0 * 3, vertices);
    _vB.fromBuffer(closestI1 * 3, vertices);
    _vC.fromBuffer(closestI2 * 3, vertices);
    this.intersectTriangle(ray, side, _vA, _vB, _vC, _hitPoint);

    const closest = new Intersection();
    closest.distance = closestDist;
    closest.point = _hitPoint.clone();
    closest.faceIndex = closestTriIndex;

    const face = new Face();
    face.a = closestI0;
    face.b = closestI1;
    face.c = closestI2;
    face.normal = new Vector3();
    Triangle.getNormal(_vA, _vB, _vC, face.normal);
    closest.face = face;

    return closest;
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

  /** Refit bounding boxes bottom-up after vertex modifications. */
  private refitNode(node: BVHNode): void {
    if (node.isLeaf) {
      this.computeLeafBounds(node);
      return;
    }

    if (node.leftChild) this.refitNode(node.leftChild);
    if (node.rightChild) this.refitNode(node.rightChild);

    // Merge child bounds.
    const bb = node.boundingBox;
    bb.min.set(Infinity, Infinity, Infinity);
    bb.max.set(-Infinity, -Infinity, -Infinity);

    if (node.leftChild) {
      bb.expandByPoint(node.leftChild.boundingBox.min);
      bb.expandByPoint(node.leftChild.boundingBox.max);
    }
    if (node.rightChild) {
      bb.expandByPoint(node.rightChild.boundingBox.min);
      bb.expandByPoint(node.rightChild.boundingBox.max);
    }
  }

  /** Recompute leaf AABB from its triangles. */
  private computeLeafBounds(node: BVHNode): void {
    const { triIndices, vertices } = this;
    const bb = node.boundingBox;
    bb.min.set(Infinity, Infinity, Infinity);
    bb.max.set(-Infinity, -Infinity, -Infinity);

    const end = node.triangleOffset + node.triangleCount;
    for (let t = node.triangleOffset; t < end; t++) {
      for (let v = 0; v < 3; v++) {
        const vi = triIndices[t * 3 + v] * 3;
        const x = vertices[vi];
        const y = vertices[vi + 1];
        const z = vertices[vi + 2];
        if (x < bb.min.x) bb.min.x = x;
        if (y < bb.min.y) bb.min.y = y;
        if (z < bb.min.z) bb.min.z = z;
        if (x > bb.max.x) bb.max.x = x;
        if (y > bb.max.y) bb.max.y = y;
        if (z > bb.max.z) bb.max.z = z;
      }
    }
  }
}
