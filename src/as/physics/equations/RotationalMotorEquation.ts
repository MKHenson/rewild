import { Vec3 } from "../maths/Vec3";
import { Body } from "../objects/Body";
import { Equation } from "./Equation";

/**
 * Rotational motor constraint. Tries to keep the relative angular velocity of the bodies to a given value.
 * @class RotationalMotorEquation
 * @constructor
 * @author schteppe
 * @param {Body} bodyA
 * @param {Body} bodyB
 * @param {Number} maxForce
 * @extends Equation
 */
export class RotationalMotorEquation extends Equation {
  axisA: Vec3;
  axisB: Vec3;
  targetVelocity: f32;

  constructor(bodyA: Body, bodyB: Body, maxForce: f32 = 1e6) {
    super(bodyA, bodyB, -maxForce, maxForce);
    this.axisA = new Vec3();
    this.axisB = new Vec3(); // World oriented rotational axis
    this.targetVelocity = 0;
  }

  computeB(h: f32): f32 {
    const a = this.a,
      b = this.b,
      bi = this.bi,
      bj = this.bj,
      axisA = this.axisA,
      axisB = this.axisB,
      GA = this.jacobianElementA,
      GB = this.jacobianElementB;

    // g = 0
    // gdot = axisA * wi - axisB * wj
    // gdot = G * W = G * [vi wi vj wj]
    // =>
    // G = [0 axisA 0 -axisB]

    GA.rotational.copy(axisA);
    axisB.negate(GB.rotational);

    const GW = this.computeGW() - this.targetVelocity,
      GiMf = this.computeGiMf();

    const B = -GW * b - h * GiMf;

    return B;
  }
}
