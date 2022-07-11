import { Vec3 } from "../maths/Vec3";
import { Body } from "../objects/Body";
import { Equation } from "./Equation";

/**
 * Rotational constraint. Works to keep the local vectors orthogonal to each other in world space.
 */
export class RotationalEquation extends Equation {
  axisA: Vec3;
  axisB: Vec3;
  maxAngle: f32;

  constructor(bodyA: Body, bodyB: Body, maxForce: f32 = 1e6, axisA = new Vec3(1, 0, 0), axisB = new Vec3(0, 1, 0)) {
    super(bodyA, bodyB, -maxForce, maxForce);
    this.axisA = axisA;
    this.axisB = axisB;

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

    const g = Math.cos(this.maxAngle) - ni.dot(nj),
      GW = this.computeGW(),
      GiMf = this.computeGiMf();

    const B = -g * a - GW * b - h * GiMf;

    return B;
  }
}

const tmpVec1 = new Vec3();
const tmpVec2 = new Vec3();
