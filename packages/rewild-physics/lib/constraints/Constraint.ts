import { Equation } from "../equations/Equation";
import { Body } from "../objects/Body";

export class Constraint {
  bodyA: Body;
  bodyB: Body;
  equations: Equation[];
  collideConnected: boolean;
  id: i32;

  /**
   * Constraint base class
   * @class Constraint
   * @author schteppe
   * @constructor
   * @param {Body} bodyA
   * @param {Body} bodyB
   * @param {object} [options]
   * @param {boolean} [options.collideConnected=true]
   * @param {boolean} [options.wakeUpBodies=true]
   */
  constructor(
    bodyA: Body,
    bodyB: Body,
    collideConnected: boolean = true,
    wakeUpBodies: boolean = true
  ) {
    /**
     * Equations to be solved in this constraint
     * @property equations
     * @type {Array}
     */
    this.equations = [];

    /**
     * @property {Body} bodyA
     */
    this.bodyA = bodyA;

    /**
     * @property {Body} bodyB
     */
    this.bodyB = bodyB;

    /**
     * @property {Number} id
     */
    this.id = Constraint.idCounter++;

    /**
     * Set to true if you want the bodies to collide when they are connected.
     * @property collideConnected
     * @type {boolean}
     */
    this.collideConnected = collideConnected;

    if (wakeUpBodies) {
      if (bodyA) {
        bodyA.wakeUp();
      }
      if (bodyB) {
        bodyB.wakeUp();
      }
    }
  }

  /**
   * Update all the equations with data.
   * @method update
   */
  update(): void {
    throw new Error(
      "method update() not implmemented in this Constraint subclass!"
    );
  }

  /**
   * Enables all equations in the constraint.
   * @method enable
   */
  enable(): void {
    const eqs = this.equations;
    for (let i: i32 = 0; i < eqs.length; i++) {
      eqs[i].enabled = true;
    }
  }

  /**
   * Disables all equations in the constraint.
   * @method disable
   */
  disable(): void {
    const eqs = this.equations;
    for (let i: i32 = 0; i < eqs.length; i++) {
      eqs[i].enabled = false;
    }
  }

  static idCounter: i32 = 0;
}
