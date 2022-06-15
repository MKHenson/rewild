import { Vec3 } from "../maths/Vec3";
import { Body } from "../objects/Body";
import { Equation } from "./Equation";

export class FrictionEquation extends Equation {
  ri: Vec3;
  rj: Vec3;
  t: Vec3;

  /**
   * Constrains the slipping in a contact along a tangent
   * @author schteppe
   * @param {Body} bodyA
   * @param {Body} bodyB
   * @param {Number} slipForce should be +-F_friction = +-mu * F_normal = +-mu * m * g
   */
  constructor(bodyA: Body, bodyB: Body, slipForce: f32) {
    super(bodyA, bodyB, -slipForce, slipForce);
    this.ri = new Vec3();
    this.rj = new Vec3();
    this.t = new Vec3(); // tangent
  }

  computeB(h: f32): f32 {
    var a = this.a,
      b = this.b,
      bi = this.bi,
      bj = this.bj,
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
    var GA = this.jacobianElementA,
      GB = this.jacobianElementB;
    t.negate(GA.spatial);
    rixt.negate(GA.rotational);
    GB.spatial.copy(t);
    GB.rotational.copy(rjxt);

    var GW = this.computeGW();
    var GiMf = this.computeGiMf();

    var B = -GW * b - h * GiMf;

    return B;
  }
}

var FrictionEquation_computeB_temp1 = new Vec3();
var FrictionEquation_computeB_temp2 = new Vec3();
