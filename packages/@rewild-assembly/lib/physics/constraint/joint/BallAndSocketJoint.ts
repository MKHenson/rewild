import { JOINT_BALL_AND_SOCKET } from "../../constants";
import { Joint } from "./Joint";
import { LinearConstraint } from "./base/LinearConstraint";
import { JointConfig } from "./JointConfig";

/**
 * A ball-and-socket joint limits relative translation on two anchor points on rigid bodies.
 *
 * @author saharan
 * @author lo-th
 */

export class BallAndSocketJoint extends Joint {
  lc: LinearConstraint;

  constructor(config: JointConfig) {
    super(config);

    this.type = JOINT_BALL_AND_SOCKET;

    this.lc = new LinearConstraint(this);
  }

  preSolve(timeStep: f32, invTimeStep: f32): void {
    this.updateAnchorPoints();

    // preSolve

    this.lc.preSolve(timeStep, invTimeStep);
  }

  solve(): void {
    this.lc.solve();
  }

  postSolve(): void {}
}
