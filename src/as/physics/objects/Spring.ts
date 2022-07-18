import { Vec3 } from "../maths/Vec3";
import { Body } from "./Body";

const Vec3 = require("../math/Vec3");

module.exports = Spring;

/**
 * A spring, connecting two bodies.
 *
 * @class Spring
 * @constructor
 * @param {Body} bodyA
 * @param {Body} bodyB
 * @param {Object} [options]
 * @param {number} [options.restLength]   A number > 0. Default: 1
 * @param {number} [options.stiffness]    A number >= 0. Default: 100
 * @param {number} [options.damping]      A number >= 0. Default: 1
 * @param {Vec3}  [options.worldAnchorA] Where to hook the spring to body A, in world coordinates.
 * @param {Vec3}  [options.worldAnchorB]
 * @param {Vec3}  [options.localAnchorA] Where to hook the spring to body A, in local body coordinates.
 * @param {Vec3}  [options.localAnchorB]
 */
export class Spring {
  /**
   * Rest length of the spring.
   * @property restLength
   * @type {number}
   */
  restLength: i32;

  /**
   * Stiffness of the spring.
   * @property stiffness
   * @type {number}
   */
  stiffness: f32;

  /**
   * Damping of the spring.
   * @property damping
   * @type {number}
   */
  damping: f32;

  /**
   * First connected body.
   * @property bodyA
   * @type {Body}
   */
  bodyA: Body;

  /**
   * Second connected body.
   * @property bodyB
   * @type {Body}
   */
  bodyB: Body;

  /**
   * Anchor for bodyA in local bodyA coordinates.
   * @property localAnchorA
   * @type {Vec3}
   */
  localAnchorA: Vec3;

  /**
   * Anchor for bodyB in local bodyB coordinates.
   * @property localAnchorB
   * @type {Vec3}
   */
  localAnchorB: Vec3;

  constructor(bodyA: Body, bodyB: Body, options) {
    options = options || {};
    this.restLength = typeof options.restLength === "number" ? options.restLength : 1;
    this.stiffness = options.stiffness || 100;
    this.damping = options.damping || 1;
    this.bodyA = bodyA;
    this.bodyB = bodyB;
    this.localAnchorA = new Vec3();

    /**
     * Anchor for bodyB in local bodyB coordinates.
     * @property localAnchorB
     * @type {Vec3}
     */
    this.localAnchorB = new Vec3();

    if (options.localAnchorA) {
      this.localAnchorA.copy(options.localAnchorA);
    }
    if (options.localAnchorB) {
      this.localAnchorB.copy(options.localAnchorB);
    }
    if (options.worldAnchorA) {
      this.setWorldAnchorA(options.worldAnchorA);
    }
    if (options.worldAnchorB) {
      this.setWorldAnchorB(options.worldAnchorB);
    }
  }

  /**
   * Set the anchor point on body A, using world coordinates.
   * @method setWorldAnchorA
   * @param {Vec3} worldAnchorA
   */
  setWorldAnchorA(worldAnchorA: Vec3): void {
    this.bodyA.pointToLocalFrame(worldAnchorA, this.localAnchorA);
  }

  /**
   * Set the anchor point on body B, using world coordinates.
   * @method setWorldAnchorB
   * @param {Vec3} worldAnchorB
   */
  setWorldAnchorB(worldAnchorB: Vec3): void {
    this.bodyB.pointToLocalFrame(worldAnchorB, this.localAnchorB);
  }

  /**
   * Get the anchor point on body A, in world coordinates.
   * @method getWorldAnchorA
   * @param {Vec3} result The vector to store the result in.
   */
  getWorldAnchorA(result: Vec3): void {
    this.bodyA.pointToWorldFrame(this.localAnchorA, result);
  }

  /**
   * Get the anchor point on body B, in world coordinates.
   * @method getWorldAnchorB
   * @param {Vec3} result The vector to store the result in.
   */
  getWorldAnchorB(result: Vec3): void {
    this.bodyB.pointToWorldFrame(this.localAnchorB, result);
  }

  /**
   * Apply the spring force to the connected bodies.
   * @method applyForce
   */
  applyForce(): void {
    const k = this.stiffness,
      d = this.damping,
      l = this.restLength,
      bodyA = this.bodyA,
      bodyB = this.bodyB,
      r = applyForce_r,
      r_unit = applyForce_r_unit,
      u = applyForce_u,
      f = applyForce_f,
      tmp = applyForce_tmp;

    const worldAnchorA = applyForce_worldAnchorA,
      worldAnchorB = applyForce_worldAnchorB,
      ri = applyForce_ri,
      rj = applyForce_rj,
      ri_x_f = applyForce_ri_x_f,
      rj_x_f = applyForce_rj_x_f;

    // Get world anchors
    this.getWorldAnchorA(worldAnchorA);
    this.getWorldAnchorB(worldAnchorB);

    // Get offset points
    worldAnchorA.vsub(bodyA.position, ri);
    worldAnchorB.vsub(bodyB.position, rj);

    // Compute distance vector between world anchor points
    worldAnchorB.vsub(worldAnchorA, r);
    const rlen = r.norm();
    r_unit.copy(r);
    r_unit.normalize();

    // Compute relative velocity of the anchor points, u
    bodyB.velocity.vsub(bodyA.velocity, u);
    // Add rotational velocity

    bodyB.angularVelocity.cross(rj, tmp);
    u.vadd(tmp, u);
    bodyA.angularVelocity.cross(ri, tmp);
    u.vsub(tmp, u);

    // F = - k * ( x - L ) - D * ( u )
    r_unit.mult(-k * (rlen - l) - d * u.dot(r_unit), f);

    // Add forces to bodies
    bodyA.force.vsub(f, bodyA.force);
    bodyB.force.vadd(f, bodyB.force);

    // Angular force
    ri.cross(f, ri_x_f);
    rj.cross(f, rj_x_f);
    bodyA.torque.vsub(ri_x_f, bodyA.torque);
    bodyB.torque.vadd(rj_x_f, bodyB.torque);
  }
}

const applyForce_r = new Vec3(),
  applyForce_r_unit = new Vec3(),
  applyForce_u = new Vec3(),
  applyForce_f = new Vec3(),
  applyForce_worldAnchorA = new Vec3(),
  applyForce_worldAnchorB = new Vec3(),
  applyForce_ri = new Vec3(),
  applyForce_rj = new Vec3(),
  applyForce_ri_x_f = new Vec3(),
  applyForce_rj_x_f = new Vec3(),
  applyForce_tmp = new Vec3();
