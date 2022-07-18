import { Equation } from "../equations/Equation";
import { World } from "../world/World";

export class Solver {
  equations: Equation[];

  /**
   * When tolerance is reached, the system is assumed to be converged.
   * @property tolerance
   * @type {Number}
   */
  tolerance: f32;
  iterations: i32;

  constructor() {
    /**
     * All equations to be solved
     * @property {Array} equations
     */
    this.equations = [];
    this.tolerance = 1e-7;
    this.iterations = 10;
  }

  /**
   * Should be implemented in subclasses!
   * @method solve
   * @param  {Number} dt
   * @param  {World} world
   */
  solve(dt: f32, world: World): i32 | undefined {
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
