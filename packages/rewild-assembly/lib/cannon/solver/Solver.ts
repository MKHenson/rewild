import { Equation } from "../equations/Equation";
import { Body } from "../objects/Body";

export class Solver {
  equations: Equation[];
  /**
   * Constraint equation solver base class.
   * @class Solver
   * @constructor
   * @author schteppe / https://github.com/schteppe
   */
  constructor() {
    /**
     * All equations to be solved
     * @property {Array} equations
     */
    this.equations = [];
  }

  /**
   * Should be implemented in subclasses!
   * @method solve
   * @param  {Number} dt
   * @param  {World} world
   */

  solve(dt: f32, worldBodies: Body[]): f32 {
    // Should return the number of iterations done!
    return 0;
  }

  /**
   * Add an equation
   * @method addEquation
   * @param {Equation} eq
   */
  addEquation(eq: Equation): void {
    if (eq.enabled) {
      this.equations.push(eq);
    }
  }

  /**
   * Remove an equation
   * @method removeEquation
   * @param {Equation} eq
   */
  removeEquation(eq: Equation): void {
    var eqs = this.equations;
    var i = eqs.indexOf(eq);
    if (i !== -1) {
      eqs.splice(i, 1);
    }
  }

  /**
   * Add all equations
   * @method removeAllEquations
   */
  removeAllEquations(): void {
    this.equations.length = 0;
  }
}
