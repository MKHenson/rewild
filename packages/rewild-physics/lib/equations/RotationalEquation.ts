import { Vec3 } from "../math/Vec3";
import { Body } from "../objects/Body";
import { Equation } from "./Equation";

const tmpVec1 = new Vec3();
const tmpVec2 = new Vec3();

export class RotationalEquation extends Equation {
  axisA: Vec3;
  axisB: Vec3;
  maxAngle: f32;

  /**
   * Rotational constraint. Works to keep the local vectors orthogonal to each other in world space.
   * @class RotationalEquation
   * @constructor
   * @author schteppe
   * @param {Body} bodyA
   * @param {Body} bodyB
   * @param {Vec3} [options.axisA]
   * @param {Vec3} [options.axisB]
   * @param {number} [options.maxForce]
   * @extends Equation
   */
  constructor(
    bodyA: Body,
    bodyB: Body,
    axisA: Vec3 | null,
    axisB: Vec3 | null,
    maxForce: f32 = 1e6
  ) {
    super(bodyA, bodyB, -maxForce, maxForce);

    this.axisA = axisA ? axisA.clone() : new Vec3(1, 0, 0);
    this.axisB = axisB ? axisB.clone() : new Vec3(0, 1, 0);

    this.maxAngle = Mathf.PI / 2;
  }

  computeB(h: f32): f32 {
    const a = this.a,
      b = this.b,
      ni = this.axisA,
      nj = this.axisB,
      nixnj = tmpVec1,
      njxni = tmpVec2,
      GA = this.jacobianElementA,
      GB = this.jacobianElementB;

    // Caluclate cross products
    ni.cross(nj, nixnj);
    nj.cross(ni, njxni);

    // g = ni * nj
    // gdot = (nj x ni) * wi + (ni x nj) * wj
    // G = [0 njxni 0 nixnj]
    // W = [vi wi vj wj]
    GA.rotational.copy(njxni);
    GB.rotational.copy(nixnj);

    const g = Mathf.cos(this.maxAngle) - ni.dot(nj),
      GW = this.computeGW(),
      GiMf = this.computeGiMf();

    const B = -g * a - GW * b - h * GiMf;

    return B;
  }
}
