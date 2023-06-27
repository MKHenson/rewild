import { Vec3 } from "../math/Vec3";
import { Body } from "../objects/Body";
import { Shape } from "../shapes/Shape";

export class RaycastResult {
  rayFromWorld: Vec3;
  rayToWorld: Vec3;
  hitNormalWorld: Vec3;
  hitPointWorld: Vec3;
  hasHit: boolean;
  shape: Shape | null;
  body: Body | null;
  hitFaceIndex: i32;
  distance: f32;
  _shouldStop: boolean;

  /**
   * Storage for Ray casting data.
   * @class RaycastResult
   * @constructor
   */
  constructor() {
    /**
     * @property {Vec3} rayFromWorld
     */
    this.rayFromWorld = new Vec3();

    /**
     * @property {Vec3} rayToWorld
     */
    this.rayToWorld = new Vec3();

    /**
     * @property {Vec3} hitNormalWorld
     */
    this.hitNormalWorld = new Vec3();

    /**
     * @property {Vec3} hitPointWorld
     */
    this.hitPointWorld = new Vec3();

    /**
     * @property {boolean} hasHit
     */
    this.hasHit = false;

    /**
     * The hit shape, or null.
     * @property {Shape} shape
     */
    this.shape = null;

    /**
     * The hit body, or null.
     * @property {Body} body
     */
    this.body = null;

    /**
     * The index of the hit triangle, if the hit shape was a trimesh.
     * @property {number} hitFaceIndex
     * @default -1
     */
    this.hitFaceIndex = -1;

    /**
     * Distance to the hit. Will be set to -1 if there was no hit.
     * @property {number} distance
     * @default -1
     */
    this.distance = -1;

    /**
     * If the ray should stop traversing the bodies.
     * @private
     * @property {Boolean} _shouldStop
     * @default false
     */
    this._shouldStop = false;
  }

  /**
   * Reset all result data.
   * @method reset
   */
  reset(): void {
    this.rayFromWorld.setZero();
    this.rayToWorld.setZero();
    this.hitNormalWorld.setZero();
    this.hitPointWorld.setZero();
    this.hasHit = false;
    this.shape = null;
    this.body = null;
    this.hitFaceIndex = -1;
    this.distance = -1;
    this._shouldStop = false;
  }

  /**
   * @method abort
   */
  abort(): void {
    this._shouldStop = true;
  }

  /**
   * @method set
   * @param {Vec3} rayFromWorld
   * @param {Vec3} rayToWorld
   * @param {Vec3} hitNormalWorld
   * @param {Vec3} hitPointWorld
   * @param {Shape} shape
   * @param {Body} body
   * @param {number} distance
   */
  set(
    rayFromWorld: Vec3,
    rayToWorld: Vec3,
    hitNormalWorld: Vec3,
    hitPointWorld: Vec3,
    shape: Shape,
    body: Body,
    distance: f32
  ): void {
    this.rayFromWorld.copy(rayFromWorld);
    this.rayToWorld.copy(rayToWorld);
    this.hitNormalWorld.copy(hitNormalWorld);
    this.hitPointWorld.copy(hitPointWorld);
    this.shape = shape;
    this.body = body;
    this.distance = distance;
  }
}
