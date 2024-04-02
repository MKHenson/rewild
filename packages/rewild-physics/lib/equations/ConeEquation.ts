import { Vec3 } from '../math/Vec3';
import { Equation } from '../equations/Equation';
import { Body } from '../objects/Body';

/**
 * Cone equation. Works to keep the given body world vectors aligned, or tilted within a given angle from each other.
 */
export class ConeEquation extends Equation {
  /**
   * Local axis in A
   */
  axisA: Vec3;
  /**
   * Local axis in B
   */
  axisB: Vec3;
  /**
   * The "cone angle" to keep
   */
  angle: f32;

  constructor(
    bodyA: Body,
    bodyB: Body,
    axisA: Vec3 | null,
    axisB: Vec3 | null,
    maxForce: f32 = 1e6,
    angle: f32 = 0
  ) {
    super(bodyA, bodyB, -maxForce, maxForce);

    this.axisA = axisA ? axisA.clone() : new Vec3(1, 0, 0);
    this.axisB = axisB ? axisB.clone() : new Vec3(0, 1, 0);
    this.angle = angle;
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

    // The angle between two vector is:
    // cos(theta) = a * b / (length(a) * length(b) = { len(a) = len(b) = 1 } = a * b

    // g = a * b
    // gdot = (b x a) * wi + (a x b) * wj
    // G = [0 bxa 0 axb]
    // W = [vi wi vj wj]
    GA.rotational.copy(njxni);
    GB.rotational.copy(nixnj);

    const g = Mathf.cos(this.angle) - ni.dot(nj);
    const GW = this.computeGW();
    const GiMf = this.computeGiMf();

    const B = -g * a - GW * b - h * GiMf;

    return B;
  }
}

const tmpVec1 = new Vec3();
const tmpVec2 = new Vec3();
