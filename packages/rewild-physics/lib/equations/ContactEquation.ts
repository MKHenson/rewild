import { Vec3 } from "../math/Vec3";
import { Body } from "../objects/Body";
import { Shape } from "../shapes/Shape";
import { Equation } from "./Equation";

const ContactEquation_computeB_temp1 = new Vec3(); // Temp vectors
const ContactEquation_computeB_temp2 = new Vec3();
const ContactEquation_computeB_temp3 = new Vec3();
const ContactEquation_getImpactVelocityAlongNormal_vi = new Vec3();
const ContactEquation_getImpactVelocityAlongNormal_vj = new Vec3();
const ContactEquation_getImpactVelocityAlongNormal_xi = new Vec3();
const ContactEquation_getImpactVelocityAlongNormal_xj = new Vec3();
const ContactEquation_getImpactVelocityAlongNormal_relVel = new Vec3();

export class ContactEquation extends Equation {
  ni: Vec3;
  ri: Vec3;
  rj: Vec3;
  restitution: f32;
  si: Shape | null;
  sj: Shape | null;

  /**
   * Contact/non-penetration constraint equation
   * @class ContactEquation
   * @constructor
   * @author schteppe
   * @param {Body} bodyA
   * @param {Body} bodyB
   * @extends Equation
   */
  constructor(bodyA: Body, bodyB: Body, maxForce: f32 = 1e6) {
    super(bodyA, bodyB, 0, maxForce);

    /**
     * @property restitution
     * @type {Number}
     */
    this.restitution = 0.0; // "bounciness": u1 = -e*u0

    /**
     * World-oriented vector that goes from the center of bi to the contact point.
     * @property {Vec3} ri
     */
    this.ri = new Vec3();

    /**
     * World-oriented vector that starts in body j position and goes to the contact point.
     * @property {Vec3} rj
     */
    this.rj = new Vec3();

    /**
     * Contact normal, pointing out of body i.
     * @property {Vec3} ni
     */
    this.ni = new Vec3();

    this.si = null;
    this.sj = null;
  }

  computeB(h: f32, bParam: f32 = 0, hParam: f32 = 0): f32 {
    const a = this.a,
      b = this.b,
      bi = this.bi,
      bj = this.bj,
      ri = this.ri,
      rj = this.rj,
      rixn = ContactEquation_computeB_temp1,
      rjxn = ContactEquation_computeB_temp2,
      vi = bi.velocity,
      wi = bi.angularVelocity,
      // fi = bi.force,
      // taui = bi.torque,
      vj = bj.velocity,
      wj = bj.angularVelocity,
      // fj = bj.force,
      // tauj = bj.torque,
      penetrationVec = ContactEquation_computeB_temp3,
      GA = this.jacobianElementA,
      GB = this.jacobianElementB,
      n = this.ni;

    // Caluclate cross products
    ri.cross(n, rixn);
    rj.cross(n, rjxn);

    // g = xj+rj -(xi+ri)
    // G = [ -ni  -rixn  ni  rjxn ]
    n.negate(GA.spatial);
    rixn.negate(GA.rotational);
    GB.spatial.copy(n);
    GB.rotational.copy(rjxn);

    // Calculate the penetration vector
    penetrationVec.copy(bj.position);
    penetrationVec.vadd(rj, penetrationVec);
    penetrationVec.vsub(bi.position, penetrationVec);
    penetrationVec.vsub(ri, penetrationVec);

    const g = n.dot(penetrationVec);

    // Compute iteration
    const ePlusOne = this.restitution + 1;
    const GW = ePlusOne * vj.dot(n) - ePlusOne * vi.dot(n) + wj.dot(rjxn) - wi.dot(rixn);
    const GiMf = this.computeGiMf();

    const B = -g * a - GW * b - h * GiMf;

    return B;
  }

  /**
   * Get the current relative velocity in the contact point.
   * @method getImpactVelocityAlongNormal
   * @return {number}
   */
  getImpactVelocityAlongNormal(): f32 {
    const vi = ContactEquation_getImpactVelocityAlongNormal_vi;
    const vj = ContactEquation_getImpactVelocityAlongNormal_vj;
    const xi = ContactEquation_getImpactVelocityAlongNormal_xi;
    const xj = ContactEquation_getImpactVelocityAlongNormal_xj;
    const relVel = ContactEquation_getImpactVelocityAlongNormal_relVel;

    this.bi.position.vadd(this.ri, xi);
    this.bj.position.vadd(this.rj, xj);

    this.bi.getVelocityAtWorldPoint(xi, vi);
    this.bj.getVelocityAtWorldPoint(xj, vj);

    vi.vsub(vj, relVel);

    return this.ni.dot(relVel);
  }
}
