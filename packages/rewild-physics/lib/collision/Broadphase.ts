import { Body } from '../objects/Body';
import { Vec3 } from '../math/Vec3';
// import { Quaternion } from '../math/Quaternion';
import { AABB } from '../collision/AABB';
import { World } from '../world/World';

/**
 * Base class for broadphase implementations
 * @author schteppe
 */
export abstract class Broadphase {
  /**
   * The world to search for collisions in.
   */
  world: World | null;
  /**
   * If set to true, the broadphase uses bounding boxes for intersection tests, else it uses bounding spheres.
   */
  useBoundingBoxes: boolean;
  /**
   * Set to true if the objects in the world moved.
   */
  dirty: boolean;

  constructor() {
    this.world = null;
    this.useBoundingBoxes = false;
    this.dirty = true;
  }

  /**
   * Get the collision pairs from the world
   * @param world The world to search in
   * @param p1 Empty array to be filled with body objects
   * @param p2 Empty array to be filled with body objects
   */
  abstract collisionPairs(world: World, p1: Body[], p2: Body[]): void;

  /**
   * Check if a body pair needs to be intersection tested at all.
   */
  needBroadphaseCollision(bodyA: Body, bodyB: Body): boolean {
    // Check collision filter masks
    if (
      (bodyA.collisionFilterGroup & bodyB.collisionFilterMask) == 0 ||
      (bodyB.collisionFilterGroup & bodyA.collisionFilterMask) == 0
    ) {
      return false;
    }

    // Check types
    if (
      ((bodyA.type & Body.STATIC) != 0 || bodyA.sleepState == Body.SLEEPING) &&
      ((bodyB.type & Body.STATIC) != 0 || bodyB.sleepState == Body.SLEEPING)
    ) {
      // Both bodies are static or sleeping. Skip.
      return false;
    }

    return true;
  }

  /**
   * Check if the bounding volumes of two bodies intersect.
   */
  intersectionTest(
    bodyA: Body,
    bodyB: Body,
    pairs1: Body[],
    pairs2: Body[]
  ): void {
    if (this.useBoundingBoxes) {
      this.doBoundingBoxBroadphase(bodyA, bodyB, pairs1, pairs2);
    } else {
      this.doBoundingSphereBroadphase(bodyA, bodyB, pairs1, pairs2);
    }
  }

  /**
   * Check if the bounding spheres of two bodies are intersecting.
   * @param pairs1 bodyA is appended to this array if intersection
   * @param pairs2 bodyB is appended to this array if intersection
   */
  doBoundingSphereBroadphase(
    bodyA: Body,
    bodyB: Body,
    pairs1: Body[],
    pairs2: Body[]
  ): void {
    const r = Broadphase_collisionPairs_r;
    bodyB.position.vsub(bodyA.position, r);
    const boundingRadiusSum2 =
      (bodyA.boundingRadius + bodyB.boundingRadius) ** 2;
    const norm2 = r.lengthSquared();
    if (norm2 < boundingRadiusSum2) {
      pairs1.push(bodyA);
      pairs2.push(bodyB);
    }
  }

  /**
   * Check if the bounding boxes of two bodies are intersecting.
   */
  doBoundingBoxBroadphase(
    bodyA: Body,
    bodyB: Body,
    pairs1: Body[],
    pairs2: Body[]
  ): void {
    if (bodyA.aabbNeedsUpdate) {
      bodyA.updateAABB();
    }
    if (bodyB.aabbNeedsUpdate) {
      bodyB.updateAABB();
    }

    // Check AABB / AABB
    if (bodyA.aabb.overlaps(bodyB.aabb)) {
      pairs1.push(bodyA);
      pairs2.push(bodyB);
    }
  }

  /**
   * Removes duplicate pairs from the pair arrays.
   */
  makePairsUnique(pairs1: Body[], pairs2: Body[]): void {
    const t = Broadphase_makePairsUnique_temp;
    const tKeys = Broadphase_makePairsUnique_tempKeys;
    const p1 = Broadphase_makePairsUnique_p1;
    const p2 = Broadphase_makePairsUnique_p2;
    const N = pairs1.length;

    for (let i: i32 = 0; i != N; i++) {
      p1[i] = pairs1[i];
      p2[i] = pairs2[i];
    }

    pairs1.length = 0;
    pairs2.length = 0;

    for (let i: i32 = 0; i != N; i++) {
      const id1 = p1[i].id;
      const id2 = p2[i].id;
      const key = id1 < id2 ? `${id1},${id2}` : `${id2},${id1}`;
      t.set(key, i);
      tKeys.push(key);
    }

    for (let i: i32 = 0; i != t.keys.length; i++) {
      const key = tKeys.pop()!;
      const pairIndex = t.get(key)!;
      pairs1.push(p1[pairIndex]);
      pairs2.push(p2[pairIndex]);
      t.delete(key);
    }
  }

  /**
   * To be implemented by subcasses
   */
  setWorld(world: World): void {}

  /**
   * Check if the bounding spheres of two bodies overlap.
   */
  static boundingSphereCheck(bodyA: Body, bodyB: Body): boolean {
    const dist = new Vec3(); // bsc_dist;
    bodyA.position.vsub(bodyB.position, dist);
    const sa = bodyA.shapes[0];
    const sb = bodyB.shapes[0];
    return (
      Mathf.pow(sa.boundingSphereRadius + sb.boundingSphereRadius, 2) >
      dist.lengthSquared()
    );
  }

  /**
   * Returns all the bodies within the AABB.
   */
  aabbQuery(world: World, aabb: AABB, result: Body[]): Body[] {
    console.warn('.aabbQuery is not implemented in this Broadphase subclass.');
    return [];
  }
}

// Temp objects
const Broadphase_collisionPairs_r = new Vec3();

// const Broadphase_collisionPairs_normal = new Vec3();
// const Broadphase_collisionPairs_quat = new Quaternion();
// const Broadphase_collisionPairs_relpos = new Vec3();

const Broadphase_makePairsUnique_temp: Map<string, i32> = new Map();
const Broadphase_makePairsUnique_tempKeys: string[] = [];
const Broadphase_makePairsUnique_p1: Body[] = [];
const Broadphase_makePairsUnique_p2: Body[] = [];

// const bsc_dist = new Vec3();
