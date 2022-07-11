import { RotationalEquation } from "../equations/RotationalEquation";
import { RotationalMotorEquation } from "../equations/RotationalMotorEquation";
import { Vec3 } from "../maths/Vec3";
import { Body } from "../objects/Body";
import { PointToPointConstraint } from "./PointToPointConstraint";

export class HingeConstraintOptions {
  constructor(
    public maxForce: f32 = 1e6,
    public pivotA: Vec3 = new Vec3(),
    public pivotB: Vec3 = new Vec3(),
    public axisA: Vec3 = new Vec3(1, 0, 0),
    public axisB: Vec3 = new Vec3(1, 0, 0)
  ) {}
}

/**
 * Hinge constraint. Think of it as a door hinge. It tries to keep the door in the correct place and with the correct orientation.
 * @class HingeConstraint
 * @constructor
 * @author schteppe
 * @param {Body} bodyA
 * @param {Body} bodyB
 * @param {object} [options]
 * @param {Vec3} [options.pivotA] A point defined locally in bodyA. This defines the offset of axisA.
 * @param {Vec3} [options.axisA] An axis that bodyA can rotate around, defined locally in bodyA.
 * @param {Vec3} [options.pivotB]
 * @param {Vec3} [options.axisB]
 * @param {Number} [options.maxForce=1e6]
 * @extends PointToPointConstraint
 */
export class HingeConstraint extends PointToPointConstraint {
  motorEquation: RotationalMotorEquation;
  rotationalEquation1: RotationalEquation;
  rotationalEquation2: RotationalEquation;
  /**
   * Rotation axis, defined locally in bodyA.
   */
  axisA: Vec3;

  /**
   * Rotation axis, defined locally in bodyB.
   */
  axisB: Vec3;

  constructor(bodyA: Body, bodyB: Body, options: HingeConstraintOptions = new HingeConstraintOptions()) {
    super(bodyA, options.pivotA, bodyB, options.pivotB, options.maxForce);

    const axisA = (this.axisA = options.axisA ? options.axisA.clone() : new Vec3(1, 0, 0));
    axisA.normalize();

    const axisB = (this.axisB = options.axisB ? options.axisB.clone() : new Vec3(1, 0, 0));
    axisB.normalize();

    const r1 = (this.rotationalEquation1 = new RotationalEquation(
      bodyA,
      bodyB,
      options.maxForce,
      options.axisA,
      options.axisB
    ));
    const r2 = (this.rotationalEquation2 = new RotationalEquation(
      bodyA,
      bodyB,
      options.maxForce,
      options.axisA,
      options.axisB
    ));
    const motor = (this.motorEquation = new RotationalMotorEquation(bodyA, bodyB, options.maxForce));
    motor.enabled = false; // Not enabled by default

    // Equations to be fed to the solver
    this.equations.push(r1); // rotational1
    this.equations.push(r2); // rotational2
    this.equations.push(motor);
  }

  /**
   * @method enableMotor
   */
  enableMotor(): void {
    this.motorEquation.enabled = true;
  }

  /**
   * @method disableMotor
   */
  disableMotor(): void {
    this.motorEquation.enabled = false;
  }

  /**
   * @method setMotorSpeed
   * @param {number} speed
   */
  setMotorSpeed(speed: f32): void {
    this.motorEquation.targetVelocity = speed;
  }

  /**
   * @method setMotorMaxForce
   * @param {number} maxForce
   */
  setMotorMaxForce(maxForce: f32): void {
    this.motorEquation.maxForce = maxForce;
    this.motorEquation.minForce = -maxForce;
  }

  update(): void {
    const bodyA = this.bodyA,
      bodyB = this.bodyB,
      motor = this.motorEquation,
      r1 = this.rotationalEquation1,
      r2 = this.rotationalEquation2,
      worldAxisA = HingeConstraint_update_tmpVec1,
      worldAxisB = HingeConstraint_update_tmpVec2;

    const axisA = this.axisA;
    const axisB = this.axisB;

    super.update();

    // Get world axes
    bodyA.quaternion.vmult(axisA, worldAxisA);
    bodyB.quaternion.vmult(axisB, worldAxisB);

    worldAxisA.tangents(r1.axisA, r2.axisA);
    r1.axisB.copy(worldAxisB);
    r2.axisB.copy(worldAxisB);

    if (this.motorEquation.enabled) {
      bodyA.quaternion.vmult(this.axisA, motor.axisA);
      bodyB.quaternion.vmult(this.axisB, motor.axisB);
    }
  }
}

const HingeConstraint_update_tmpVec1 = new Vec3();
const HingeConstraint_update_tmpVec2 = new Vec3();
