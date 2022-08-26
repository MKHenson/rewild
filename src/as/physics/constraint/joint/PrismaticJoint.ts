import { JOINT_PRISMATIC } from "../../constants";
import { Joint } from "./Joint";
import { LimitMotor } from "./LimitMotor";
import { Vec3 } from "../../math/Vec3";
import { Quat } from "../../math/Quat";
import { _Math } from "../../math/Math";

import { AngularConstraint } from "./base/AngularConstraint";
import { Translational3Constraint } from "./base/Translational3Constraint";
import { JointConfig } from "./JointConfig";

/**
 * A prismatic joint allows only for relative translation of rigid bodies along the axis.
 *
 * @author saharan
 * @author lo-th
 */

export class PrismaticJoint extends Joint {
  type = JOINT_PRISMATIC;

  // The axis in the first body's coordinate system.
  localAxis1: Vec3;
  // The axis in the second body's coordinate system.
  localAxis2: Vec3;

  ax1: Vec3;
  ax2: Vec3;

  nor: Vec3;
  tan: Vec3;
  bin: Vec3;

  ac: AngularConstraint;

  // The translational limit and motor information of the joint.
  limitMotor: LimitMotor;
  t3: Translational3Constraint;

  constructor(config: JointConfig, lowerTranslation: f32, upperTranslation: f32) {
    super(config);

    this.type = JOINT_PRISMATIC;

    this.localAxis1 = config.localAxis1.clone().normalize();
    this.localAxis2 = config.localAxis2.clone().normalize();

    this.ax1 = new Vec3();
    this.ax2 = new Vec3();

    this.nor = new Vec3();
    this.tan = new Vec3();
    this.bin = new Vec3();

    this.ac = new AngularConstraint(this, new Quat().setFromUnitVectors(this.localAxis1, this.localAxis2));

    this.limitMotor = new LimitMotor(this.nor, true);
    this.limitMotor.lowerLimit = lowerTranslation;
    this.limitMotor.upperLimit = upperTranslation;
    this.t3 = new Translational3Constraint(
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

    // preSolve

    this.ac.preSolve(timeStep, invTimeStep);
    this.t3.preSolve(timeStep, invTimeStep);
  }

  solve(): void {
    this.ac.solve();
    this.t3.solve();
  }

  postSolve(): void {}
}
