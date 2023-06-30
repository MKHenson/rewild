import { Quaternion } from "../math/Quaternion";
import { Vec3 } from "../math/Vec3";
import { Body } from "../objects/Body";
import { World } from "../world/World";
import { AABB } from "./AABB";

// const bsc_dist = new Vec3();
const Broadphase_collisionPairs_r = new Vec3(); // Temp objects
// Broadphase_collisionPairs_normal = new Vec3(),
// Broadphase_collisionPairs_quat = new Quaternion(),
// Broadphase_collisionPairs_relpos = new Vec3();
const Broadphase_makePairsUnique_temp_keys: string[] = [];
const Broadphase_makePairsUnique_temp: Map<string, i32> = new Map(),
  Broadphase_makePairsUnique_p1: Body[] = [],
  Broadphase_makePairsUnique_p2: Body[] = [];

export abstract class Broadphase {
  world: World | null;
  useBoundingBoxes: boolean;
  dirty: boolean;

  /**
   * Base class for broadphase implementations
   * @class Broadphase
   * @constructor
   * @author schteppe
   */
  constructor() {
    /**
     * The world to search for collisions in.
     * @property world
     * @type {World}
     */
    this.world = null;

    /**
     * If set to true, the broadphase uses bounding boxes for intersection test, else it uses bounding spheres.
     * @property useBoundingBoxes
     * @type {Boolean}
     */
    this.useBoundingBoxes = false;

    /**
     * Set to true if the objects in the world moved.
     * @property {Boolean} dirty
     */
    this.dirty = true;
  }

  /**
   * Get the collision pairs from the world
   * @method collisionPairs
   * @param {World} world The world to search in
   * @param {Array} p1 Empty array to be filled with body objects
   * @param {Array} p2 Empty array to be filled with body objects
   */
  abstract collisionPairs(world: World, p1: Body[], p2: Body[]): void;

  /**
   * Check if a body pair needs to be intersection tested at all.
   * @method needBroadphaseCollision
   * @param {Body} bodyA
   * @param {Body} bodyB
   * @return {bool}
   */
  needBroadphaseCollision(bodyA: Body, bodyB: Body): boolean {
    // Check collision filter masks
    if (
      (bodyA.collisionFilterGroup & bodyB.collisionFilterMask) === 0 ||
      (bodyB.collisionFilterGroup & bodyA.collisionFilterMask) === 0
    ) {
      return false;
    }

    // Check types
    if (
      ((bodyA.type & Body.STATIC) !== 0 || bodyA.sleepState === Body.SLEEPING) &&
      ((bodyB.type & Body.STATIC) !== 0 || bodyB.sleepState === Body.SLEEPING)
    ) {
      // Both bodies are static or sleeping. Skip.
      return false;
    }

    return true;
  }

  /**
   * Check if the bounding volumes of two bodies intersect.
   * @method intersectionTest
   * @param {Body} bodyA
   * @param {Body} bodyB
   * @param {array} pairs1
   * @param {array} pairs2
   */
  intersectionTest(bodyA: Body, bodyB: Body, pairs1: Body[], pairs2: Body[]) {
    if (this.useBoundingBoxes) {
      this.doBoundingBoxBroadphase(bodyA, bodyB, pairs1, pairs2);
    } else {
      this.doBoundingSphereBroadphase(bodyA, bodyB, pairs1, pairs2);
    }
  }

  /**
   * Check if the bounding spheres of two bodies are intersecting.
   * @method doBoundingSphereBroadphase
   * @param {Body} bodyA
   * @param {Body} bodyB
   * @param {Array} pairs1 bodyA is appended to this array if intersection
   * @param {Array} pairs2 bodyB is appended to this array if intersection
   */

  doBoundingSphereBroadphase(bodyA: Body, bodyB: Body, pairs1: Body[], pairs2: Body[]): void {
    const r = Broadphase_collisionPairs_r;
    bodyB.position.vsub(bodyA.position, r);
    const boundingRadiusSum2 = Mathf.pow(bodyA.boundingRadius + bodyB.boundingRadius, 2);
    const norm2 = r.norm2();
    if (norm2 < boundingRadiusSum2) {
      pairs1.push(bodyA);
      pairs2.push(bodyB);
    }
  }

  /**
   * Check if the bounding boxes of two bodies are intersecting.
   * @method doBoundingBoxBroadphase
   * @param {Body} bodyA
   * @param {Body} bodyB
   * @param {Array} pairs1
   * @param {Array} pairs2
   */
  doBoundingBoxBroadphase(bodyA: Body, bodyB: Body, pairs1: Body[], pairs2: Body[]): void {
    if (bodyA.aabbNeedsUpdate) {
      bodyA.computeAABB();
    }
    if (bodyB.aabbNeedsUpdate) {
      bodyB.computeAABB();
    }

    // Check AABB / AABB
    if (bodyA.aabb.overlaps(bodyB.aabb)) {
      pairs1.push(bodyA);
      pairs2.push(bodyB);
    }
  }

  /**
   * Removes duplicate pairs from the pair arrays.
   * @method makePairsUnique
   * @param {Array} pairs1
   * @param {Array} pairs2
   */

  makePairsUnique(pairs1: Body[], pairs2: Body[]): void {
    const tKeys = Broadphase_makePairsUnique_temp_keys;
    const t = Broadphase_makePairsUnique_temp,
      p1 = Broadphase_makePairsUnique_p1,
      p2 = Broadphase_makePairsUnique_p2,
      N = pairs1.length;

    for (let i: i32 = 0; i !== N; i++) {
      p1[i] = pairs1[i];
      p2[i] = pairs2[i];
    }

    pairs1.length = 0;
    pairs2.length = 0;

    for (let i: i32 = 0; i !== N; i++) {
      const id1 = p1[i].id,
        id2 = p2[i].id;
      const key = id1 < id2 ? id1.toString() + "," + id2.toString() : id2.toString() + "," + id1.toString();
      t.set(key, i);
      tKeys.push(key);
      // t.keys.push(key);
    }

    for (let i: i32 = 0; i != t.keys.length; i++) {
      const key = tKeys.pop(), // t.keys.pop(),
        pairIndex = t.get(key);
      pairs1.push(p1[pairIndex]);
      pairs2.push(p2[pairIndex]);
      t.delete(key);
    }
  }

  /**
   * To be implemented by subcasses
   * @method setWorld
   * @param {World} world
   */
  setWorld(world: World): void {}

  // /**
  //  * Check if the bounding spheres of two bodies overlap.
  //  * @method boundingSphereCheck
  //  * @param {Body} bodyA
  //  * @param {Body} bodyB
  //  * @return {boolean}
  //  */
  // static boundingSphereCheck(bodyA: Body, bodyB: Body): boolean {
  //   const dist = bsc_dist;
  //   bodyA.position.vsub(bodyB.position, dist);
  //   return Mathf.pow(bodyA.shape.boundingSphereRadius + bodyB.shape.boundingSphereRadius, 2) > dist.norm2();
  // }

  /**
   * Returns all the bodies within the AABB.
   * @method aabbQuery
   * @param  {World} world
   * @param  {AABB} aabb
   * @param  {array} result An array to store resulting bodies in.
   * @return {array}
   */
  abstract aabbQuery(world: World, aabb: AABB, result: Body[]): Body[];
}
