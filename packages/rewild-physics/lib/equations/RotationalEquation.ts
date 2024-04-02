import { Equation } from '../equations/Equation';
import { Vec3 } from '../math/Vec3';
import { Body } from '../objects/Body';

/**
 * Rotational constraint. Works to keep the local vectors orthogonal to each other in world space.
 */
export class RotationalEquation extends Equation {
  /**
   * World oriented rotational axis.
   */
  axisA: Vec3;
  /**
   * World oriented rotational axis.
   */
  axisB: Vec3;
  /**
   * maxAngle
   */
  maxAngle: f32;

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
    const a = this.a;
    const b = this.b;
    const ni = this.axisA;
    const nj = this.axisB;
    const nixnj = tmpVec1;
    const njxni = tmpVec2;
    const GA = this.jacobianElementA;
    const GB = this.jacobianElementB;

    // Caluclate cross products
    ni.cross(nj, nixnj);
    nj.cross(ni, njxni);

    // g = ni * nj
    // gdot = (nj x ni) * wi + (ni x nj) * wj
    // G = [0 njxni 0 nixnj]
    // W = [vi wi vj wj]
    GA.rotational.copy(njxni);
    GB.rotational.copy(nixnj);

    const g = Mathf.cos(this.maxAngle) - ni.dot(nj);
    const GW = this.computeGW();
    const GiMf = this.computeGiMf();

    const B = -g * a - GW * b - h * GiMf;

    return B;
  }
}

const tmpVec1 = new Vec3();
const tmpVec2 = new Vec3();
