/**
 * An information of limit and motor.
 *
 * @author saharan
 */

import { Vec3 } from "../../math/Vec3";

export class LimitMotor {
  // The axis of the constraint.
  axis: Vec3;
  // The current angle for rotational constraints.
  angle: f32;
  // The lower limit. Set lower > upper to disable
  lowerLimit: f32;

  //  The upper limit. Set lower > upper to disable.
  upperLimit: f32;
  // The target motor speed.
  motorSpeed: f32;
  // The maximum motor force or torque. Set 0 to disable.
  maxMotorForce: f32;
  // The frequency of the spring. Set 0 to disable.
  frequency: f32;
  // The damping ratio of the spring. Set 0 for no damping, 1 for critical damping.
  dampingRatio: f32;

  constructor(axis: Vec3, fixed: boolean = false) {
    this.axis = axis;
    this.angle = 0;
    this.lowerLimit = fixed ? 0 : 1;

    this.upperLimit = 0;
    this.motorSpeed = 0;
    this.maxMotorForce = 0;
    this.frequency = 0;
    this.dampingRatio = 0;
  }

  // Set limit data into this constraint.
  setLimit(lowerLimit: f32, upperLimit: f32): void {
    this.lowerLimit = lowerLimit;
    this.upperLimit = upperLimit;
  }

  // Set motor data into this constraint.
  setMotor(motorSpeed: f32, maxMotorForce: f32): void {
    this.motorSpeed = motorSpeed;
    this.maxMotorForce = maxMotorForce;
  }

  // Set spring data into this constraint.
  setSpring(frequency: f32, dampingRatio: f32): void {
    this.frequency = frequency;
    this.dampingRatio = dampingRatio;
  }
}
