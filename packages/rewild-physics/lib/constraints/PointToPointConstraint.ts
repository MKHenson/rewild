import { ContactEquation } from "../equations/ContactEquation";
import { Vec3 } from "../math/Vec3";
import { Body } from "../objects/Body";
import { Constraint } from "./Constraint";

export class PointToPointConstraint extends Constraint {
  pivotA: Vec3;
  pivotB: Vec3;
  equationX: ContactEquation;
  equationY: ContactEquation;
  equationZ: ContactEquation;

  /**
   * Connects two bodies at given offset points.
   * @class PointToPointConstraint
   * @extends Constraint
   * @constructor
   * @param {Body} bodyA
   * @param {Vec3} pivotA The point relative to the center of mass of bodyA which bodyA is constrained to.
   * @param {Body} bodyB Body that will be constrained in a similar way to the same point as bodyA. We will therefore get a link between bodyA and bodyB. If not specified, bodyA will be constrained to a static point.
   * @param {Vec3} pivotB See pivotA.
   * @param {Number} maxForce The maximum force that should be applied to constrain the bodies.
   *
   * @example
   *     const bodyA = new Body({ mass: 1 });
   *     const bodyB = new Body({ mass: 1 });
   *     bodyA.position.set(-1, 0, 0);
   *     bodyB.position.set(1, 0, 0);
   *     bodyA.addShape(shapeA);
   *     bodyB.addShape(shapeB);
   *     world.addBody(bodyA);
   *     world.addBody(bodyB);
   *     const localPivotA = new Vec3(1, 0, 0);
   *     const localPivotB = new Vec3(-1, 0, 0);
   *     const constraint = new PointToPointConstraint(bodyA, localPivotA, bodyB, localPivotB);
   *     world.addConstraint(constraint);
   */
  constructor(
    bodyA: Body,
    pivotA: Vec3 | null,
    bodyB: Body,
    pivotB: Vec3 | null,
    maxForce: f32 = 1e6
  ) {
    super(bodyA, bodyB);

    /**
     * Pivot, defined locally in bodyA.
     * @property {Vec3} pivotA
     */
    this.pivotA = pivotA ? pivotA.clone() : new Vec3();

    /**
     * Pivot, defined locally in bodyB.
     * @property {Vec3} pivotB
     */
    this.pivotB = pivotB ? pivotB.clone() : new Vec3();

    /**
     * @property {ContactEquation} equationX
     */
    const x = (this.equationX = new ContactEquation(bodyA, bodyB));

    /**
     * @property {ContactEquation} equationY
     */
    const y = (this.equationY = new ContactEquation(bodyA, bodyB));

    /**
     * @property {ContactEquation} equationZ
     */
    const z = (this.equationZ = new ContactEquation(bodyA, bodyB));

    // Equations to be fed to the solver
    this.equations.push(x);
    this.equations.push(y);
    this.equations.push(z);

    // Make the equations bidirectional
    x.minForce = y.minForce = z.minForce = -maxForce;
    x.maxForce = y.maxForce = z.maxForce = maxForce;

    x.ni.set(1, 0, 0);
    y.ni.set(0, 1, 0);
    z.ni.set(0, 0, 1);
  }

  update(): void {
    const bodyA = this.bodyA;
    const bodyB = this.bodyB;
    const x = this.equationX;
    const y = this.equationY;
    const z = this.equationZ;

    // Rotate the pivots to world space
    bodyA.quaternion.vmult(this.pivotA, x.ri);
    bodyB.quaternion.vmult(this.pivotB, x.rj);

    y.ri.copy(x.ri);
    y.rj.copy(x.rj);
    z.ri.copy(x.ri);
    z.rj.copy(x.rj);
  }
}
