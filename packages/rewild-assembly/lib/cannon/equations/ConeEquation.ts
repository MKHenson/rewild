import { Vec3 } from "../math/Vec3";
import { Body } from "../objects/Body";
import { Equation } from "./Equation";

const tmpVec1 = new Vec3();
const tmpVec2 = new Vec3();

export class ConeEquation extends Equation {
  axisA: Vec3;
  axisB: Vec3;
  angle: f32;

  /**
   * Cone equation. Works to keep the given body world vectors aligned, or tilted within a given angle from each other.
   * @class ConeEquation
   * @constructor
   * @author schteppe
   * @param {Body} bodyA
   * @param {Body} bodyB
   * @param {Vec3} [options.axisA] Local axis in A
   * @param {Vec3} [options.axisB] Local axis in B
   * @param {Vec3} [options.angle] The "cone angle" to keep
   * @param {number} [options.maxForce=1e6]
   * @extends Equation
   */
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

    /**
     * The cone angle to keep
     * @property {number} angle
     */
    this.angle = angle;
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

    // The angle between two vector is:
    // cos(theta) = a * b / (length(a) * length(b) = { len(a) = len(b) = 1 } = a * b

    // g = a * b
    // gdot = (b x a) * wi + (a x b) * wj
    // G = [0 bxa 0 axb]
    // W = [vi wi vj wj]
    GA.rotational.copy(njxni);
    GB.rotational.copy(nixnj);

    const g = Math.cos(this.angle) - ni.dot(nj),
      GW = this.computeGW(),
      GiMf = this.computeGiMf();

    const B = -g * a - GW * b - h * GiMf;

    return B;
  }
}
