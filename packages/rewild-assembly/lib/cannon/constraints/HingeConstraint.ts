import { RotationalEquation } from "../equations/RotationalEquation";
import { RotationalMotorEquation } from "../equations/RotationalMotorEquation";
import { Vec3 } from "../math/Vec3";
import { Body } from "../objects/Body";
import { PointToPointConstraint } from "./PointToPointConstraint";

const HingeConstraint_update_tmpVec1 = new Vec3();
const HingeConstraint_update_tmpVec2 = new Vec3();

export class HingeConstraint extends PointToPointConstraint {
  axisA: Vec3;
  axisB: Vec3;
  rotationalEquation1: RotationalEquation;
  rotationalEquation2: RotationalEquation;
  motorEquation: RotationalMotorEquation;

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
  constructor(
    bodyA: Body,
    bodyB: Body,
    pivA: Vec3 | null,
    pivB: Vec3 | null,
    axisA: Vec3 | null,
    axisB: Vec3 | null,
    maxForce: f32 = 1e6
  ) {
    const pivotA = pivA ? pivA.clone() : new Vec3();
    const pivotB = pivB ? pivB.clone() : new Vec3();

    super(bodyA, pivotA, bodyB, pivotB, maxForce);

    /**
     * Rotation axis, defined locally in bodyA.
     * @property {Vec3} axisA
     */
    const axA = (this.axisA = axisA ? axisA.clone() : new Vec3(1, 0, 0));
    axA.normalize();

    /**
     * Rotation axis, defined locally in bodyB.
     * @property {Vec3} axisB
     */
    const axB = (this.axisB = axisB ? axisB.clone() : new Vec3(1, 0, 0));
    axB.normalize();

    /**
     * @property {RotationalEquation} rotationalEquation1
     */
    const r1 = (this.rotationalEquation1 = new RotationalEquation(
      bodyA,
      bodyB,
      axA,
      axB,
      maxForce
    ));

    /**
     * @property {RotationalEquation} rotationalEquation2
     */
    const r2 = (this.rotationalEquation2 = new RotationalEquation(
      bodyA,
      bodyB,
      axisA,
      axB,
      maxForce
    ));

    /**
     * @property {RotationalMotorEquation} motorEquation
     */
    const motor = (this.motorEquation = new RotationalMotorEquation(
      bodyA,
      bodyB,
      maxForce
    ));
    motor.enabled = false; // Not enabled by default

    // Equations to be fed to the solver
    this.equations.push(r1); // rotational1
    this.equations.push(r2); // rotational2
    this.equations.push(motor);
  }

  /**
   * @method enableMotor
   */
  enableMotor() {
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
