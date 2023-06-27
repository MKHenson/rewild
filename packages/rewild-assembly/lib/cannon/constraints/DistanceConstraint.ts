import { ContactEquation } from "../equations/ContactEquation";
import { Body } from "../objects/Body";
import { Constraint } from "./Constraint";

export class DistanceConstraint extends Constraint {
  distance: f32;
  distanceEquation: ContactEquation;

  /**
   * Constrains two bodies to be at a constant distance from each others center of mass.
   * @class DistanceConstraint
   * @constructor
   * @author schteppe
   * @param {Body} bodyA
   * @param {Body} bodyB
   * @param {Number} [distance] The distance to keep. If undefined, it will be set to the current distance between bodyA and bodyB
   * @param {Number} [maxForce=1e6]
   * @extends Constraint
   */
  constructor(
    bodyA: Body,
    bodyB: Body,
    distance: f32 = bodyA.position.distanceTo(bodyB.position),
    maxForce: f32 = 1e6
  ) {
    super(bodyA, bodyB);

    /**
     * @property {number} distance
     */
    this.distance = distance;

    /**
     * @property {ContactEquation} distanceEquation
     */
    const eq = (this.distanceEquation = new ContactEquation(bodyA, bodyB));
    this.equations.push(eq);

    // Make it bidirectional
    eq.minForce = -maxForce;
    eq.maxForce = maxForce;
  }

  update() {
    const bodyA = this.bodyA;
    const bodyB = this.bodyB;
    const eq = this.distanceEquation;
    const halfDist = this.distance * 0.5;
    const normal = eq.ni;

    bodyB.position.vsub(bodyA.position, normal);
    normal.normalize();
    normal.mult(halfDist, eq.ri);
    normal.mult(-halfDist, eq.rj);
  }
}
