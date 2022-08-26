import { JOINT_HINGE } from "../../constants";
import { Joint } from "./Joint";
import { LimitMotor } from "./LimitMotor";
import { Vec3 } from "../../math/Vec3";
import { Quat } from "../../math/Quat";
import { Mat33 } from "../../math/Mat33";
import { _Math } from "../../math/Math";

import { LinearConstraint } from "./base/LinearConstraint";
import { Rotational3Constraint } from "./base/Rotational3Constraint";
import { JointConfig } from "./JointConfig";

/**
 * A hinge joint allows only for relative rotation of rigid bodies along the axis.
 *
 * @author saharan
 * @author lo-th
 */

export class HingeJoint extends Joint {
  localAxis1: Vec3;
  localAxis2: Vec3;
  localAngle1: Vec3;
  localAngle2: Vec3;

  ax1: Vec3;
  ax2: Vec3;
  an1: Vec3;
  an2: Vec3;

  tmp: Vec3;

  nor: Vec3;
  tan: Vec3;
  bin: Vec3;

  limitMotor: LimitMotor;
  lc: LinearConstraint;
  r3: Rotational3Constraint;

  constructor(config: JointConfig, lowerAngleLimit: f32, upperAngleLimit: f32) {
    super(config);

    this.type = JOINT_HINGE;

    // The axis in the first body's coordinate system.
    this.localAxis1 = config.localAxis1.clone().normalize();
    // The axis in the second body's coordinate system.
    this.localAxis2 = config.localAxis2.clone().normalize();

    // make angle axis
    var arc = new Mat33().setQuat(new Quat().setFromUnitVectors(this.localAxis1, this.localAxis2));
    this.localAngle1 = new Vec3().tangent(this.localAxis1).normalize();
    this.localAngle2 = this.localAngle1.clone().applyMatrix3(arc, true);

    this.ax1 = new Vec3();
    this.ax2 = new Vec3();
    this.an1 = new Vec3();
    this.an2 = new Vec3();

    this.tmp = new Vec3();

    this.nor = new Vec3();
    this.tan = new Vec3();
    this.bin = new Vec3();

    // The rotational limit and motor information of the joint.
    this.limitMotor = new LimitMotor(this.nor, false);
    this.limitMotor.lowerLimit = lowerAngleLimit;
    this.limitMotor.upperLimit = upperAngleLimit;

    this.lc = new LinearConstraint(this);
    this.r3 = new Rotational3Constraint(
      this,
      this.limitMotor,
      new LimitMotor(this.tan, true),
      new LimitMotor(this.bin, true)
    );
  }

  preSolve(timeStep: f32, invTimeStep: f32): void {
    this.updateAnchorPoints();

    this.ax1.copy(this.localAxis1).applyMatrix3(this.body1!.rotation, true);
    this.ax2.copy(this.localAxis2).applyMatrix3(this.body2!.rotation, true);

    this.an1.copy(this.localAngle1).applyMatrix3(this.body1!.rotation, true);
    this.an2.copy(this.localAngle2).applyMatrix3(this.body2!.rotation, true);

    // normal tangent binormal

    this.nor
      .set(
        this.ax1.x * this.body2!.inverseMass + this.ax2.x * this.body1!.inverseMass,
        this.ax1.y * this.body2!.inverseMass + this.ax2.y * this.body1!.inverseMass,
        this.ax1.z * this.body2!.inverseMass + this.ax2.z * this.body1!.inverseMass
      )
      .normalize();

    this.tan.tangent(this.nor).normalize();

    this.bin.crossVectors(this.nor, this.tan);

    // calculate hinge angle

    var limite = _Math.acosClamp(_Math.dotVectors(this.an1, this.an2));

    this.tmp.crossVectors(this.an1, this.an2);

    if (_Math.dotVectors(this.nor, this.tmp) < 0) this.limitMotor.angle = -limite;
    else this.limitMotor.angle = limite;

    this.tmp.crossVectors(this.ax1, this.ax2);

    this.r3.limitMotor2.angle = _Math.dotVectors(this.tan, this.tmp);
    this.r3.limitMotor3.angle = _Math.dotVectors(this.bin, this.tmp);

    // preSolve

    this.r3.preSolve(timeStep, invTimeStep);
    this.lc.preSolve(timeStep, invTimeStep);
  }

  solve(): void {
    this.r3.solve();
    this.lc.solve();
  }

  postSolve(): void {}
}
