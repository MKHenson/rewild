import { Equation } from "../equations/Equation";
import { Body } from "../objects/Body";

export class ConstraintOptions {
  constructor(public collideConnected = true, public wakeUpBodies = true) {}
}

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
export abstract class Constraint {
  static idCounter: i32 = 0;

  /**
   * Equations to be solved in this constraint
   */
  equations: Equation[];
  bodyA: Body;
  bodyB: Body;
  id: i32;

  /**
   * Set to true if you want the bodies to collide when they are connected.
   */
  collideConnected: boolean;

  constructor(bodyA: Body, bodyB: Body, options = new ConstraintOptions()) {
    this.equations = [];
    this.bodyA = bodyA;
    this.bodyB = bodyB;
    this.id = Constraint.idCounter++;
    this.collideConnected = options.collideConnected;

    if (options.wakeUpBodies) {
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
  abstract update(): void;

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
}
