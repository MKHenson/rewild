import { Vec3 } from "../math/Vec3";
import { Body } from "../objects/Body";
import { Equation } from "./Equation";

const FrictionEquation_computeB_temp1 = new Vec3();
const FrictionEquation_computeB_temp2 = new Vec3();

export class FrictionEquation extends Equation {
  ri: Vec3;
  rj: Vec3;
  t: Vec3;

  /**
   * Constrains the slipping in a contact along a tangent
   * @class FrictionEquation
   * @constructor
   * @author schteppe
   * @param {Body} bodyA
   * @param {Body} bodyB
   * @param {Number} slipForce should be +-F_friction = +-mu * F_normal = +-mu * m * g
   * @extends Equation
   */
  constructor(bodyA: Body, bodyB: Body, slipForce: f32) {
    super(bodyA, bodyB, -slipForce, slipForce);
    this.ri = new Vec3();
    this.rj = new Vec3();
    this.t = new Vec3(); // tangent
  }

  computeB(h: f32, bParam: f32 = 0, hParam: f32 = 0): f32 {
    // const a = this.a,
    const b = this.b,
      // bi = this.bi,
      // bj = this.bj,
      ri = this.ri,
      rj = this.rj,
      rixt = FrictionEquation_computeB_temp1,
      rjxt = FrictionEquation_computeB_temp2,
      t = this.t;

    // Caluclate cross products
    ri.cross(t, rixt);
    rj.cross(t, rjxt);

    // G = [-t -rixt t rjxt]
    // And remember, this is a pure velocity constraint, g is always zero!
    const GA = this.jacobianElementA,
      GB = this.jacobianElementB;
    t.negate(GA.spatial);
    rixt.negate(GA.rotational);
    GB.spatial.copy(t);
    GB.rotational.copy(rjxt);

    const GW = this.computeGW();
    const GiMf = this.computeGiMf();

    const B = -GW * b - h * GiMf;

    return B;
  }
}
