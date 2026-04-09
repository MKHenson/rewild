import { Box3, Frustum, Ray, Vector3 } from 'rewild-common';
import { Transform } from '../core/Transform';
import { Intersection } from '../core/Raycaster';
import { RenderLayer } from '../core/RenderLayer';
import { SceneBVHNode } from './SceneBVHNode';
import { isVisualComponent } from '../typeGuards';
import { IVisualComponent, IRaycaster } from '../../types/interfaces';

const _worldBox = new Box3();
const _boxTarget = new Vector3();

/** Maximum objects per leaf node before splitting. */
const MAX_LEAF_OBJECTS = 8;

/** Maximum tree depth. */
const MAX_DEPTH = 24;

/**
 * Scene-level BVH acceleration structure for frustum culling and raycasting.
 *
 * Built FROM the scene graph — does not replace it. The existing
 * `scene: Transform` hierarchy remains the source of truth. SceneBVH holds
 * references to Transform nodes and accelerates spatial queries.
 *
 * **Manual control**: The developer explicitly calls `markDirty()` or
 * `rebuild()` after structural scene changes (add/remove objects).
 * Moving objects are tracked via `markObjectMoved()` for efficient refitting.
 */
export class SceneBVH {
  private root: SceneBVHNode | null = null;
  private sceneRoot: Transform;

  /** Flat list of objects currently in the BVH. */
  private objects: Transform[] = [];

  /** World-space AABBs for each object (parallel to `objects`). */
  private worldBoxes: Box3[] = [];

  // --- Change tracking (manual control) ---
  private isDirty: boolean = true;
  private movedObjects: Set<Transform> = new Set();

  /** Fraction of moved objects that triggers a full rebuild instead of refit. */
  updateThreshold: number = 0.1;

  /** Last seen structureVersion from the scene root. */
  private lastStructureVersion: number = -1;

  constructor(sceneRoot: Transform) {
    this.sceneRoot = sceneRoot;
  }

  /**
   * Mark the BVH as needing a rebuild.
   * Call this after adding/removing objects from the scene.
   * Rebuild will happen on next `update()` call.
   */
  markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Force immediate rebuild of the entire BVH from the scene graph.
   * Use after batch operations (loading scenes, adding many objects).
   */
  rebuild(): void {
    this.objects.length = 0;
    this.worldBoxes.length = 0;
    this.collectObjects(this.sceneRoot);
    this.computeWorldBoxes();

    if (this.objects.length > 0) {
      const indices = new Uint32Array(this.objects.length);
      for (let i = 0; i < indices.length; i++) indices[i] = i;
      this.root = this.buildNode(indices, 0, indices.length, 0);
    } else {
      this.root = null;
    }

    this.isDirty = false;
    this.lastStructureVersion = this.sceneRoot.structureVersion;
    this.movedObjects.clear();
  }

  /**
   * Mark an object as moved (for refit optimisation).
   * Can be called by Renderer when transforms update.
   */
  markObjectMoved(transform: Transform): void {
    this.movedObjects.add(transform);
  }

  /**
   * Update BVH based on dirty flag and moved objects.
   * Call in the render loop or manually after changes.
   */
  update(): void {
    // Detect structural changes anywhere in the scene tree.
    const currentVersion = this.sceneRoot.structureVersion;
    if (currentVersion !== this.lastStructureVersion) {
      this.isDirty = true;
    }

    if (this.isDirty || this.root === null) {
      this.rebuild();
      return;
    }

    const movedCount = this.movedObjects.size;
    if (movedCount === 0) return;

    const totalCount = this.objects.length;

    if (totalCount === 0) return;

    if (movedCount / totalCount > this.updateThreshold) {
      // Too many objects moved — rebuild is faster
      this.rebuild();
    } else {
      // Few objects moved — refit existing structure
      this.refitMoved();
      this.movedObjects.clear();
    }
  }

  // ───────────────────── Queries ─────────────────────

  /**
   * Return all visible transforms whose world bounding box intersects the
   * given frustum.
   */
  frustumCull(frustum: Frustum, results: Transform[] = []): Transform[] {
    if (this.root) {
      this.frustumCullNode(this.root, frustum, results);
    }
    return results;
  }

  /**
   * Raycast against the scene BVH. For each candidate transform whose AABB
   * the ray hits, delegates to the transform's component raycast (which may
   * in turn use a per-geometry BVH).
   *
   * @param raycaster - The raycaster instance (passed through to component raycast).
   * @param intersects - Array to push results into.
   */
  raycast(
    raycaster: IRaycaster,
    intersects: Intersection[] = []
  ): Intersection[] {
    if (this.root) {
      this.raycastNode(this.root, raycaster, intersects);
    }
    return intersects;
  }

  /**
   * Return all transforms whose world bounding box intersects the given box.
   */
  queryBox(box: Box3, results: Transform[] = []): Transform[] {
    if (this.root) {
      this.queryBoxNode(this.root, box, results);
    }
    return results;
  }

  /**
   * Return all transforms whose world bounding box is within `radius` of
   * `point`.
   */
  queryRadius(
    point: Vector3,
    radius: f32,
    results: Transform[] = []
  ): Transform[] {
    // Use an AABB approximation for the sphere query.
    _worldBox.min.set(point.x - radius, point.y - radius, point.z - radius);
    _worldBox.max.set(point.x + radius, point.y + radius, point.z + radius);
    if (this.root) {
      this.queryBoxNode(this.root, _worldBox, results);
    }
    return results;
  }

  dispose(): void {
    this.root = null;
    this.objects.length = 0;
    this.worldBoxes.length = 0;
    this.movedObjects.clear();
  }

  // ───────────────────── Build ─────────────────────

  /**
   * Recursively collect visible transforms with visual components
   * (Mesh, Sprite3D, etc.) from the scene graph.
   * Overlay subtrees are skipped — they are rendered in a separate pass.
   */
  private collectObjects(
    transform: Transform,
    isOverlay: boolean = false
  ): void {
    if (!transform.visible) return;

    const overlay = isOverlay || transform.renderLayer === RenderLayer.Overlay;

    if (
      !overlay &&
      transform.component &&
      isVisualComponent(transform.component)
    ) {
      this.objects.push(transform);
    }

    const children = transform.children;
    for (let i = 0, l = children.length; i < l; i++) {
      this.collectObjects(children[i], overlay);
    }
  }

  /** Compute world-space AABBs for all collected objects. */
  private computeWorldBoxes(): void {
    const { objects, worldBoxes } = this;
    worldBoxes.length = objects.length;

    for (let i = 0, l = objects.length; i < l; i++) {
      const transform = objects[i];
      const component = transform.component as unknown as IVisualComponent;
      const geometry = component.geometry;

      if (geometry.boundingBox === null) geometry.computeBoundingBox();

      const box = new Box3();
      box.copy(geometry.boundingBox!);
      box.applyMatrix4(transform.matrixWorld);
      worldBoxes[i] = box;
    }
  }

  /**
   * Build a BVH node for object indices[start..end) using center split.
   * Center split is chosen over SAH because scene objects are far fewer
   * than triangles, and rebuild speed matters more.
   */
  private buildNode(
    indices: Uint32Array,
    start: i32,
    end: i32,
    depth: i32
  ): SceneBVHNode {
    const node = new SceneBVHNode();
    const count = end - start;

    // Compute bounding box for this subset.
    this.computeNodeBounds(indices, start, end, node.boundingBox);

    // Leaf conditions.
    if (count <= MAX_LEAF_OBJECTS || depth >= MAX_DEPTH) {
      node.isLeaf = true;
      for (let i = start; i < end; i++) {
        node.objects.push(this.objects[indices[i]]);
      }
      return node;
    }

    // Find longest axis and split at midpoint.
    const bb = node.boundingBox;
    const dx = bb.max.x - bb.min.x;
    const dy = bb.max.y - bb.min.y;
    const dz = bb.max.z - bb.min.z;

    let axis: i32 = 0;
    if (dy > dx) axis = 1;
    if (dz > (axis === 0 ? dx : dy)) axis = 2;

    const mid =
      axis === 0
        ? bb.min.x + dx * 0.5
        : axis === 1
        ? bb.min.y + dy * 0.5
        : bb.min.z + dz * 0.5;

    // Partition indices by world-box center vs midpoint.
    let left = start;
    let right = end - 1;

    while (left <= right) {
      const lb = this.worldBoxes[indices[left]];
      const lc =
        axis === 0
          ? (lb.min.x + lb.max.x) * 0.5
          : axis === 1
          ? (lb.min.y + lb.max.y) * 0.5
          : (lb.min.z + lb.max.z) * 0.5;
      if (lc < mid) {
        left++;
        continue;
      }

      const rb = this.worldBoxes[indices[right]];
      const rc =
        axis === 0
          ? (rb.min.x + rb.max.x) * 0.5
          : axis === 1
          ? (rb.min.y + rb.max.y) * 0.5
          : (rb.min.z + rb.max.z) * 0.5;
      if (rc >= mid) {
        right--;
        continue;
      }

      // Swap
      const tmp = indices[left];
      indices[left] = indices[right];
      indices[right] = tmp;
      left++;
      right--;
    }

    // Fallback: if everything ended up on one side, split in the middle.
    if (left === start || left === end) {
      left = (start + end) >> 1;
    }

    node.leftChild = this.buildNode(indices, start, left, depth + 1);
    node.rightChild = this.buildNode(indices, left, end, depth + 1);

    return node;
  }

  /** Compute AABB enclosing objects at indices[start..end). */
  private computeNodeBounds(
    indices: Uint32Array,
    start: i32,
    end: i32,
    target: Box3
  ): void {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    for (let i = start; i < end; i++) {
      const box = this.worldBoxes[indices[i]];
      if (box.min.x < minX) minX = box.min.x;
      if (box.min.y < minY) minY = box.min.y;
      if (box.min.z < minZ) minZ = box.min.z;
      if (box.max.x > maxX) maxX = box.max.x;
      if (box.max.y > maxY) maxY = box.max.y;
      if (box.max.z > maxZ) maxZ = box.max.z;
    }

    target.min.set(minX, minY, minZ);
    target.max.set(maxX, maxY, maxZ);
  }

  // ───────────────────── Refit ─────────────────────

  /** Refit world boxes for moved objects, then update BVH bounds bottom-up. */
  private refitMoved(): void {
    // Update world boxes for moved objects.
    for (const transform of this.movedObjects) {
      const idx = this.objects.indexOf(transform);
      if (idx === -1) continue;

      const component = transform.component as unknown as IVisualComponent;
      const geometry = component.geometry;
      if (geometry.boundingBox === null) geometry.computeBoundingBox();

      const box = this.worldBoxes[idx];
      box.copy(geometry.boundingBox!);
      box.applyMatrix4(transform.matrixWorld);
    }

    // Bottom-up refit of the tree.
    if (this.root) {
      this.refitNode(this.root);
    }
  }

  /** Recursively refit node bounds from leaf data. */
  private refitNode(node: SceneBVHNode): void {
    if (node.isLeaf) {
      const bb = node.boundingBox;
      bb.min.set(Infinity, Infinity, Infinity);
      bb.max.set(-Infinity, -Infinity, -Infinity);

      for (let i = 0, l = node.objects.length; i < l; i++) {
        const transform = node.objects[i];
        const idx = this.objects.indexOf(transform);
        if (idx === -1) continue;
        const box = this.worldBoxes[idx];
        bb.expandByPoint(box.min);
        bb.expandByPoint(box.max);
      }
      return;
    }

    if (node.leftChild) this.refitNode(node.leftChild);
    if (node.rightChild) this.refitNode(node.rightChild);

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

  // ───────────────────── Query Traversal ─────────────────────

  private frustumCullNode(
    node: SceneBVHNode,
    frustum: Frustum,
    results: Transform[]
  ): void {
    if (!frustum.intersectsBox(node.boundingBox)) return;

    if (node.isLeaf) {
      for (let i = 0, l = node.objects.length; i < l; i++) {
        const transform = node.objects[i];
        if (!transform.visible) continue;
        // Overlay-layer objects are collected separately; skip here.
        if (transform.renderLayer === RenderLayer.Overlay) continue;

        // Fine-grained test against object's own world AABB.
        const idx = this.objects.indexOf(transform);
        if (idx !== -1 && frustum.intersectsBox(this.worldBoxes[idx])) {
          results.push(transform);
        }
      }
      return;
    }

    if (node.leftChild) this.frustumCullNode(node.leftChild, frustum, results);
    if (node.rightChild)
      this.frustumCullNode(node.rightChild, frustum, results);
  }

  private raycastNode(
    node: SceneBVHNode,
    raycaster: IRaycaster,
    intersects: Intersection[]
  ): void {
    if (!('ray' in raycaster)) return;

    const ray = (raycaster as any).ray as Ray;
    const far = (raycaster as any).far ?? Infinity;

    if (!ray.intersectBox(node.boundingBox, _boxTarget)) return;

    const boxDist = ray.origin.distanceTo(_boxTarget);
    if (boxDist > far) return;

    if (node.isLeaf) {
      for (let i = 0, l = node.objects.length; i < l; i++) {
        const transform = node.objects[i];
        if (!transform.visible) continue;
        if (!transform.layers.test(raycaster.layers)) continue;

        // Test against object's world AABB before delegating to component.
        const idx = this.objects.indexOf(transform);
        if (idx !== -1 && ray.intersectBox(this.worldBoxes[idx], _boxTarget)) {
          // Delegate to component raycast (which may use geometry BVH).
          transform.raycast(raycaster, intersects);
        }
      }
      return;
    }

    if (node.leftChild) this.raycastNode(node.leftChild, raycaster, intersects);
    if (node.rightChild)
      this.raycastNode(node.rightChild, raycaster, intersects);
  }

  private queryBoxNode(
    node: SceneBVHNode,
    box: Box3,
    results: Transform[]
  ): void {
    if (!node.boundingBox.intersectsBox(box)) return;

    if (node.isLeaf) {
      for (let i = 0, l = node.objects.length; i < l; i++) {
        const transform = node.objects[i];
        if (!transform.visible) continue;

        const idx = this.objects.indexOf(transform);
        if (idx !== -1 && this.worldBoxes[idx].intersectsBox(box)) {
          results.push(transform);
        }
      }
      return;
    }

    if (node.leftChild) this.queryBoxNode(node.leftChild, box, results);
    if (node.rightChild) this.queryBoxNode(node.rightChild, box, results);
  }
}
