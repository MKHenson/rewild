import { PointToPointConstraint } from '../constraints/PointToPointConstraint';
import { ConeEquation } from '../equations/ConeEquation';
import { RotationalEquation } from '../equations/RotationalEquation';
import { Vec3 } from '../math/Vec3';
import { Body } from '../objects/Body';

/**
 * A Cone Twist constraint, useful for ragdolls.
 */
export class ConeTwistConstraint extends PointToPointConstraint {
  /**
   * The axis direction for the constraint of the body A.
   */
  axisA: Vec3;
  /**
   * The axis direction for the constraint of the body B.
   */
  axisB: Vec3;
  /**
   * The aperture angle of the cone.
   */
  angle: number;
  /**
   * The twist angle of the joint.
   */
  twistAngle: number;
  coneEquation: ConeEquation;
  twistEquation: RotationalEquation;

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
    collideConnected: boolean = false
  ) {
    super(
      bodyA,
      pivotA ? pivotA.clone() : new Vec3(),
      bodyB,
      pivotB ? pivotB.clone() : new Vec3(),
      maxForce
    );

    this.axisA = axisA ? axisA.clone() : new Vec3();
    this.axisB = axisB ? axisB.clone() : new Vec3();

    this.collideConnected = !!collideConnected;

    this.angle = angle;

    const c = (this.coneEquation = new ConeEquation(
      bodyA,
      bodyB,
      axisA,
      axisB,
      maxForce,
      angle
    ));

    const t = (this.twistEquation = new RotationalEquation(
      bodyA,
      bodyB,
      axisA,
      axisB,
      maxForce
    ));
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
    const bodyA = this.bodyA;
    const bodyB = this.bodyB;
    const cone = this.coneEquation;
    const twist = this.twistEquation;

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

// const ConeTwistConstraint_update_tmpVec1 = new Vec3();
// const ConeTwistConstraint_update_tmpVec2 = new Vec3();
