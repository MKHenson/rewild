import { PointToPointConstraint } from '../constraints/PointToPointConstraint';
import { RotationalEquation } from '../equations/RotationalEquation';
import { RotationalMotorEquation } from '../equations/RotationalMotorEquation';
import { Vec3 } from '../math/Vec3';
import { Body } from '../objects/Body';

/**
 * Hinge constraint. Think of it as a door hinge. It tries to keep the door in the correct place and with the correct orientation.
 */
export class HingeConstraint extends PointToPointConstraint {
  /**
   * Rotation axis, defined locally in bodyA.
   */
  axisA: Vec3;
  /**
   * Rotation axis, defined locally in bodyB.
   */
  axisB: Vec3;

  rotationalEquation1: RotationalEquation;
  rotationalEquation2: RotationalEquation;
  motorEquation: RotationalMotorEquation;
  motorTargetVelocity: f32 = 0;

  constructor(
    bodyA: Body,
    bodyB: Body,
    pivA: Vec3 | null,
    pivB: Vec3 | null,
    axA: Vec3 | null,
    axB: Vec3 | null,
    maxForce: f32 = 1e6,
    collideConnected: boolean = false
  ) {
    const pivotA = pivA ? pivA.clone() : new Vec3();
    const pivotB = pivB ? pivB.clone() : new Vec3();

    super(bodyA, pivotA, bodyB, pivotB, maxForce);

    const axisA = (this.axisA = axA ? axA.clone() : new Vec3(1, 0, 0));
    axisA.normalize();

    const axisB = (this.axisB = axB ? axB.clone() : new Vec3(1, 0, 0));
    axisB.normalize();

    this.collideConnected = !!collideConnected;

    const rotational1 = (this.rotationalEquation1 = new RotationalEquation(
      bodyA,
      bodyB,
      axisA,
      axisB,
      maxForce
    ));
    const rotational2 = (this.rotationalEquation2 = new RotationalEquation(
      bodyA,
      bodyB,
      axisA,
      axisB,
      maxForce
    ));
    const motor = (this.motorEquation = new RotationalMotorEquation(
      bodyA,
      bodyB,
      maxForce
    ));
    motor.enabled = false; // Not enabled by default

    // Equations to be fed to the solver
    this.equations.push(rotational1);
    this.equations.push(rotational2);
    this.equations.push(motor);
  }

  /**
   * enableMotor
   */
  enableMotor(): void {
    this.motorEquation.enabled = true;
  }

  /**
   * disableMotor
   */
  disableMotor(): void {
    this.motorEquation.enabled = false;
  }

  /**
   * setMotorSpeed
   */
  setMotorSpeed(speed: f32): void {
    this.motorEquation.targetVelocity = speed;
  }

  /**
   * setMotorMaxForce
   */
  setMotorMaxForce(maxForce: f32): void {
    this.motorEquation.maxForce = maxForce;
    this.motorEquation.minForce = -maxForce;
  }

  /**
   * update
   */
  update(): void {
    const bodyA = this.bodyA;
    const bodyB = this.bodyB;
    const motor = this.motorEquation;
    const r1 = this.rotationalEquation1;
    const r2 = this.rotationalEquation2;
    const worldAxisA = HingeConstraint_update_tmpVec1;
    const worldAxisB = HingeConstraint_update_tmpVec2;

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
