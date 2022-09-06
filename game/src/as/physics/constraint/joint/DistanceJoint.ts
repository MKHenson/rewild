import { JOINT_DISTANCE } from "../../constants";
import { Joint } from "./Joint";
import { LimitMotor } from "./LimitMotor";
import { Vec3 } from "../../math/Vec3";

import { TranslationalConstraint } from "./base/TranslationalConstraint";
import { JointConfig } from "./JointConfig";

/**
 * A distance joint limits the distance between two anchor points on rigid bodies.
 *
 * @author saharan
 * @author lo-th
 */

export class DistanceJoint extends Joint {
  nor: Vec3;
  limitMotor: LimitMotor;
  t: TranslationalConstraint;

  constructor(config: JointConfig, minDistance: f32, maxDistance: f32) {
    super(config);

    this.type = JOINT_DISTANCE;

    this.nor = new Vec3();

    // The limit and motor information of the joint.
    this.limitMotor = new LimitMotor(this.nor, true);
    this.limitMotor.lowerLimit = minDistance;
    this.limitMotor.upperLimit = maxDistance;

    this.t = new TranslationalConstraint(this, this.limitMotor);
  }

  preSolve(timeStep: f32, invTimeStep: f32): void {
    this.updateAnchorPoints();

    this.nor.sub(this.anchorPoint2, this.anchorPoint1).normalize();

    // preSolve

    this.t.preSolve(timeStep, invTimeStep);
  }

  solve(): void {
    this.t.solve();
  }

  postSolve(): void {}
}
