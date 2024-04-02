import { JacobianElement } from '../math/JacobianElement';
import { Vec3 } from '../math/Vec3';
import { Body } from '../objects/Body';
import { Shape } from '../shapes/Shape';

/**
 * Equation base class.
 *
 * `a`, `b` and `eps` are {@link https://www8.cs.umu.se/kurser/5DV058/VT15/lectures/SPOOKlabnotes.pdf SPOOK} parameters that default to `0.0`. See {@link https://github.com/schteppe/cannon.js/issues/238#issuecomment-147172327 this exchange} for more details on Cannon's physics implementation.
 */
export class Equation {
  id: i32;
  /**
   * Minimum (read: negative max) force to be applied by the constraint.
   */
  minForce: f32;
  /**
   * Maximum (read: positive max) force to be applied by the constraint.
   */
  maxForce: f32;
  bi: Body;
  bj: Body;
  si!: Shape;
  sj!: Shape;
  /**
   * SPOOK parameter
   */
  a: f32;
  /**
   * SPOOK parameter
   */
  b: f32;
  /**
   * SPOOK parameter
   */
  eps: f32;
  jacobianElementA: JacobianElement;
  jacobianElementB: JacobianElement;
  enabled: boolean;
  /**
   * A number, proportional to the force added to the bodies.
   */
  multiplier: f32;

  static idCounter: i32 = 0;

  constructor(bi: Body, bj: Body, minForce: f32 = -1e6, maxForce: f32 = 1e6) {
    this.id = Equation.idCounter++;
    this.minForce = minForce;
    this.maxForce = maxForce;
    this.bi = bi;
    this.bj = bj;
    this.a = 0.0; // SPOOK parameter
    this.b = 0.0; // SPOOK parameter
    this.eps = 0.0; // SPOOK parameter
    this.jacobianElementA = new JacobianElement();
    this.jacobianElementB = new JacobianElement();
    this.enabled = true;
    this.multiplier = 0;

    this.setSpookParams(1e7, 4, 1 / 60); // Set typical spook params
  }

  /**
   * Recalculates a, b, and eps.
   *
   * The Equation constructor sets typical SPOOK parameters as such:
   * * `stiffness` = 1e7
   * * `relaxation` = 4
   * * `timeStep`= 1 / 60, _note the hardcoded refresh rate._
   */
  setSpookParams(stiffness: f32, relaxation: f32, timeStep: f32): void {
    const d = relaxation;
    const k = stiffness;
    const h = timeStep;
    this.a = 4.0 / (h * (1 + 4 * d));
    this.b = (4.0 * d) / (1 + 4 * d);
    this.eps = 4.0 / (h * h * k * (1 + 4 * d));
  }

  /**
   * Computes the right hand side of the SPOOK equation
   */
  computeB(a: f32, b: f32 = 0, h: f32 = 0): f32 {
    const GW = this.computeGW();
    const Gq = this.computeGq();
    const GiMf = this.computeGiMf();
    return -Gq * a - GW * b - GiMf * h;
  }

  /**
   * Computes G*q, where q are the generalized body coordinates
   */
  computeGq(): f32 {
    const GA = this.jacobianElementA;
    const GB = this.jacobianElementB;
    const bi = this.bi;
    const bj = this.bj;
    const xi = bi.position;
    const xj = bj.position;
    return GA.spatial.dot(xi) + GB.spatial.dot(xj);
  }

  /**
   * Computes G*W, where W are the body velocities
   */
  computeGW(): f32 {
    const GA = this.jacobianElementA;
    const GB = this.jacobianElementB;
    const bi = this.bi;
    const bj = this.bj;
    const vi = bi.velocity;
    const vj = bj.velocity;
    const wi = bi.angularVelocity;
    const wj = bj.angularVelocity;
    return GA.multiplyVectors(vi, wi) + GB.multiplyVectors(vj, wj);
  }

  /**
   * Computes G*Wlambda, where W are the body velocities
   */
  computeGWlambda(): f32 {
    const GA = this.jacobianElementA;
    const GB = this.jacobianElementB;
    const bi = this.bi;
    const bj = this.bj;
    const vi = bi.vlambda;
    const vj = bj.vlambda;
    const wi = bi.wlambda;
    const wj = bj.wlambda;
    return GA.multiplyVectors(vi, wi) + GB.multiplyVectors(vj, wj);
  }

  /**
   * Computes G*inv(M)*f, where M is the mass matrix with diagonal blocks for each body, and f are the forces on the bodies.
   */
  computeGiMf(): f32 {
    const GA = this.jacobianElementA;
    const GB = this.jacobianElementB;
    const bi = this.bi;
    const bj = this.bj;
    const fi = bi.force;
    const ti = bi.torque;
    const fj = bj.force;
    const tj = bj.torque;
    const invMassi = bi.invMassSolve;
    const invMassj = bj.invMassSolve;

    fi.scale(invMassi, iMfi);
    fj.scale(invMassj, iMfj);

    bi.invInertiaWorldSolve.vmult(ti, invIi_vmult_taui);
    bj.invInertiaWorldSolve.vmult(tj, invIj_vmult_tauj);

    return (
      GA.multiplyVectors(iMfi, invIi_vmult_taui) +
      GB.multiplyVectors(iMfj, invIj_vmult_tauj)
    );
  }

  /**
   * Computes G*inv(M)*G'
   */
  computeGiMGt(): f32 {
    const GA = this.jacobianElementA;
    const GB = this.jacobianElementB;
    const bi = this.bi;
    const bj = this.bj;
    const invMassi = bi.invMassSolve;
    const invMassj = bj.invMassSolve;
    const invIi = bi.invInertiaWorldSolve;
    const invIj = bj.invInertiaWorldSolve;
    let result: f32 = invMassi + invMassj;

    invIi.vmult(GA.rotational, tmp);
    result += tmp.dot(GA.rotational);

    invIj.vmult(GB.rotational, tmp);
    result += tmp.dot(GB.rotational);

    return result;
  }

  /**
   * Add constraint velocity to the bodies.
   */
  addToWlambda(deltalambda: f32): void {
    const GA = this.jacobianElementA;
    const GB = this.jacobianElementB;
    const bi = this.bi;
    const bj = this.bj;
    const temp = addToWlambda_temp;

    // Add to linear velocity
    // v_lambda += inv(M) * delta_lamba * G
    bi.vlambda.addScaledVector(
      bi.invMassSolve * deltalambda,
      GA.spatial,
      bi.vlambda
    );
    bj.vlambda.addScaledVector(
      bj.invMassSolve * deltalambda,
      GB.spatial,
      bj.vlambda
    );

    // Add to angular velocity
    bi.invInertiaWorldSolve.vmult(GA.rotational, temp);
    bi.wlambda.addScaledVector(deltalambda, temp, bi.wlambda);

    bj.invInertiaWorldSolve.vmult(GB.rotational, temp);
    bj.wlambda.addScaledVector(deltalambda, temp, bj.wlambda);
  }

  /**
   * Compute the denominator part of the SPOOK equation: C = G*inv(M)*G' + eps
   */
  computeC(): f32 {
    return this.computeGiMGt() + this.eps;
  }
}

const iMfi = new Vec3();
const iMfj = new Vec3();
const invIi_vmult_taui = new Vec3();
const invIj_vmult_tauj = new Vec3();

const tmp = new Vec3();
const addToWlambda_temp = new Vec3();
