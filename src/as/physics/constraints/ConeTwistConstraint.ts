import { ConeEquation, ConeEquationOptions } from "../equations/ConeEquation";
import { RotationalEquation } from "../equations/RotationalEquation";
import { Vec3 } from "../maths/Vec3";
import { Body } from "../objects/Body";
import { PointToPointConstraint } from "./PointToPointConstraint";

export class ConeTwistConstraintOptions {
  constructor(
    public maxForce: f32 = 1e6,
    public pivotA: Vec3 = new Vec3(),
    public pivotB: Vec3 = new Vec3(),
    public axisA: Vec3 = new Vec3(),
    public axisB: Vec3 = new Vec3(),
    public collideConnected: boolean = false,
    public angle: f32 = 0,
    public twistAngle: f32 = 0
  ) {}

  toConeEquation(): ConeEquationOptions {
    return new ConeEquationOptions(this.axisA, this.axisB, this.maxForce, this.angle);
  }
}

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
export class ConeTwistConstraint extends PointToPointConstraint {
  axisA: Vec3;
  axisB: Vec3;
  angle: f32;
  twistEquation: RotationalEquation;
  coneEquation: ConeEquation;
  twistAngle: f32 = 0;

  constructor(bodyA: Body, bodyB: Body, options = new ConeTwistConstraintOptions()) {
    // Set pivot point in between
    super(bodyA, options.pivotA, bodyB, options.pivotB, options.maxForce);

    this.collideConnected = !!options.collideConnected;
    this.angle = options.angle;
    const c = (this.coneEquation = new ConeEquation(bodyA, bodyB, options.toConeEquation()));
    const t = (this.twistEquation = new RotationalEquation(
      bodyA,
      bodyB,
      options.maxForce,
      options.axisA,
      options.axisB
    ));
    this.twistAngle = options.twistAngle;

    // Make the cone equation push the bodies toward the cone axis, not outward
    c.maxForce = 0;
    c.minForce = -options.maxForce;

    // Make the twist equation add torque toward the initial position
    t.maxForce = 0;
    t.minForce = -options.maxForce;

    this.equations.push(c);
    this.equations.push(t);
  }

  update(): void {
    const bodyA = this.bodyA,
      bodyB = this.bodyB,
      cone = this.coneEquation,
      twist = this.twistEquation;

    PointToPointConstraint.prototype.update.call(this);

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

const ConeTwistConstraint_update_tmpVec1 = new Vec3();
const ConeTwistConstraint_update_tmpVec2 = new Vec3();
