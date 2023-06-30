import { ConeEquation } from "../equations/ConeEquation";
import { RotationalEquation } from "../equations/RotationalEquation";
import { Vec3 } from "../math/Vec3";
import { Body } from "../objects/Body";
import { PointToPointConstraint } from "./PointToPointConstraint";

// const ConeTwistConstraint_update_tmpVec1 = new Vec3();
// const ConeTwistConstraint_update_tmpVec2 = new Vec3();

export class ConeTwistConstraint extends PointToPointConstraint {
  axisA: Vec3;
  axisB: Vec3;
  coneEquation: ConeEquation;
  twistEquation: RotationalEquation;
  angle: f32;
  twistAngle: f32;
  collideConnected: boolean;

  /**
   * @class ConeTwistConstraint
   * @constructor
   * @author schteppe
   * @param {Body} bodyA
   * @param {Body} bodyB
   * @param {object} [options]
   * @param {Vec3} [options.pivotA]
   * @param {Vec3} [options.pivotB]
   * @param {Vec3} [options.axisA]
   * @param {Vec3} [options.axisB]
   * @param {Number} [options.maxForce=1e6]
   * @extends PointToPointConstraint
   */
  constructor(
    bodyA: Body,
    bodyB: Body,
    pivotA: Vec3 | null,
    pivotB: Vec3 | null,
    axisA: Vec3 | null,
    axisB: Vec3 | null,
    maxForce: f32 = 1e6,
    angle: f32 = 0,
    twistAngle: f32 = 0,
    collideConnected: boolean = true
  ) {
    super(bodyA, pivotA ? pivotA.clone() : new Vec3(), bodyB, pivotB ? pivotB.clone() : new Vec3(), maxForce);

    // Set pivot point in between
    this.axisA = axisA ? axisA.clone() : new Vec3();
    this.axisB = axisB ? axisB.clone() : new Vec3();

    this.collideConnected = !!collideConnected;

    this.angle = angle;

    /**
     * @property {ConeEquation} coneEquation
     */
    const c = (this.coneEquation = new ConeEquation(bodyA, bodyB, axisA, axisB, maxForce, angle));

    /**
     * @property {RotationalEquation} twistEquation
     */
    const t = (this.twistEquation = new RotationalEquation(bodyA, bodyB, axisA, axisB, maxForce));
    this.twistAngle = twistAngle;

    // Make the cone equation push the bodies toward the cone axis, not outward
    c.maxForce = 0;
    c.minForce = -maxForce;

    // Make the twist equation add torque toward the initial position
    t.maxForce = 0;
    t.minForce = -maxForce;

    this.equations.push(c);
    this.equations.push(t);
  }

  update(): void {
    const bodyA = this.bodyA,
      bodyB = this.bodyB,
      cone = this.coneEquation,
      twist = this.twistEquation;

    super.update();

    // Update the axes to the cone constraint
    bodyA.vectorToWorldFrame(this.axisA, cone.axisA);
    bodyB.vectorToWorldFrame(this.axisB, cone.axisB);

    // Update the world axes in the twist constraint
    this.axisA.tangents(twist.axisA, twist.axisA);
    bodyA.vectorToWorldFrame(twist.axisA, twist.axisA);

    this.axisB.tangents(twist.axisB, twist.axisB);
    bodyB.vectorToWorldFrame(twist.axisB, twist.axisB);

    cone.angle = this.angle;
    twist.maxAngle = this.twistAngle;
  }
}
