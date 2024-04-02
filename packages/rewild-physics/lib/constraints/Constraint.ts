import { Body } from '../objects/Body';
import { Equation } from '../equations/Equation';

/**
 * Constraint base class
 */
export class Constraint {
  /**
   * Equations to be solved in this constraint.
   */
  equations: Equation[];
  /**
   * Body A.
   */
  bodyA: Body;
  /**
   * Body B.
   */
  bodyB: Body;
  id: i32;
  /**
   * Set to false if you don't want the bodies to collide when they are connected.
   */
  collideConnected: boolean;

  static idCounter: i32 = 0;

  constructor(
    bodyA: Body,
    bodyB: Body,
    collideConnected: boolean = true,
    wakeUpBodies: boolean = true
  ) {
    this.equations = [];
    this.bodyA = bodyA;
    this.bodyB = bodyB;
    this.id = Constraint.idCounter++;
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
   */
  update(): void {
    throw new Error(
      'method update() not implmemented in this Constraint subclass!'
    );
  }

  /**
   * Enables all equations in the constraint.
   */
  enable(): void {
    const eqs = this.equations;
    for (let i: i32 = 0; i < eqs.length; i++) {
      eqs[i].enabled = true;
    }
  }

  /**
   * Disables all equations in the constraint.
   */
  disable(): void {
    const eqs = this.equations;
    for (let i: i32 = 0; i < eqs.length; i++) {
      eqs[i].enabled = false;
    }
  }
}
