import { Vec3 } from "../maths/Vec3";
import { Body } from "../objects/Body";
import { Equation } from "./Equation";

export class ConeEquationOptions {
  constructor(
    public axisA = new Vec3(1, 0, 0),
    public axisB = new Vec3(0, 1, 0),
    public maxForce: f32 = 1e6,
    public angle: f32 = 0
  ) {}
}

/**
 * Cone equation. Works to keep the given body world vectors aligned, or tilted within a given angle from each other.
 */
export class ConeEquation extends Equation {
  axisA: Vec3;
  axisB: Vec3;
  /**
   * The cone angle to keep
   */
  angle: f32;

  constructor(bodyA: Body, bodyB: Body, options = new ConeEquationOptions()) {
    super(bodyA, bodyB, -options.maxForce, options.maxForce);

    this.axisA = options.axisA;
    this.axisB = options.axisB;
    this.angle = options.angle;
  }

  computeB(h: f32) {
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

const tmpVec1 = new Vec3();
const tmpVec2 = new Vec3();
