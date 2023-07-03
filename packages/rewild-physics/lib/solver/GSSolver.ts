import { Body } from "../objects/Body";
import { Solver } from "./Solver";

const GSSolver_solve_lambda: f32[] = []; // Just temporary number holders that we want to reuse each solve.
const GSSolver_solve_invCs: f32[] = [];
const GSSolver_solve_Bs: f32[] = [];

export class GSSolver extends Solver {
  iterations: i32;
  tolerance: f32;

  /**
   * Constraint equation Gauss-Seidel solver.
   * @class GSSolver
   * @constructor
   * @todo The spook parameters should be specified for each constraint, not globally.
   * @author schteppe / https://github.com/schteppe
   * @see https://www8.cs.umu.se/kurser/5DV058/VT09/lectures/spooknotes.pdf
   * @extends Solver
   */
  constructor() {
    super();

    /**
     * The number of solver iterations determines quality of the constraints in the world. The more iterations, the more correct simulation. More iterations need more computations though. If you have a large gravity force in your world, you will need more iterations.
     * @property iterations
     * @type {Number}
     * @todo write more about solver and iterations in the wiki
     */
    this.iterations = 10;

    /**
     * When tolerance is reached, the system is assumed to be converged.
     * @property tolerance
     * @type {Number}
     */
    this.tolerance = 1e-7;
  }

  solve(dt: f32, worldBodies: Body[]): i32 {
    let iter: i32 = 0,
      maxIter = this.iterations,
      tolSquared = this.tolerance * this.tolerance,
      equations = this.equations,
      Neq = equations.length,
      bodies = worldBodies, // world.bodies,
      Nbodies = bodies.length,
      h = dt,
      // q,
      B: f32,
      invC: f32,
      deltalambda: f32,
      deltalambdaTot: f32,
      GWlambda: f32,
      lambdaj: f32;

    // Update solve mass
    if (Neq !== 0) {
      for (let i: i32 = 0; i != Nbodies; i++) {
        bodies[i].updateSolveMassProperties();
      }
    }

    // Things that does not change during iteration can be computed once
    const invCs = GSSolver_solve_invCs,
      Bs = GSSolver_solve_Bs,
      lambda = GSSolver_solve_lambda;
    invCs.length = Neq;
    Bs.length = Neq;
    lambda.length = Neq;

    for (let i: i32 = 0; i !== Neq; i++) {
      const c = equations[i];
      lambda[i] = 0.0;
      Bs[i] = c.computeB(h);
      invCs[i] = 1.0 / c.computeC();
    }

    if (Neq !== 0) {
      // Reset vlambda
      for (let i: i32 = 0; i !== Nbodies; i++) {
        const b = bodies[i],
          vlambda = b.vlambda,
          wlambda = b.wlambda;
        vlambda.set(0, 0, 0);
        wlambda.set(0, 0, 0);
      }

      // Iterate over equations
      for (iter = 0; iter !== maxIter; iter++) {
        // Accumulate the total error for each iteration.
        deltalambdaTot = 0.0;

        for (let j: i32 = 0; j !== Neq; j++) {
          const c = equations[j];

          // Compute iteration
          B = Bs[j];
          invC = invCs[j];
          lambdaj = lambda[j];
          GWlambda = c.computeGWlambda();
          deltalambda = invC * (B - GWlambda - c.eps * lambdaj);

          // Clamp if we are not within the min/max interval
          if (lambdaj + deltalambda < c.minForce) {
            deltalambda = c.minForce - lambdaj;
          } else if (lambdaj + deltalambda > c.maxForce) {
            deltalambda = c.maxForce - lambdaj;
          }
          lambda[j] += deltalambda;

          deltalambdaTot += deltalambda > 0.0 ? deltalambda : -deltalambda; // abs(deltalambda)

          c.addToWlambda(deltalambda);
        }

        // If the total error is small enough - stop iterate
        if (deltalambdaTot * deltalambdaTot < tolSquared) {
          break;
        }
      }

      // Add result to velocity
      for (let i: i32 = 0; i !== Nbodies; i++) {
        const b = bodies[i],
          v = b.velocity,
          w = b.angularVelocity;

        b.vlambda.vmul(b.linearFactor, b.vlambda);
        v.vadd(b.vlambda, v);

        b.wlambda.vmul(b.angularFactor, b.wlambda);
        w.vadd(b.wlambda, w);
      }

      // Set the .multiplier property of each equation
      let l = equations.length;
      const invDt: f32 = 1 / h;
      while (l--) {
        equations[l].multiplier = lambda[l] * invDt;
      }
    }

    return iter;
  }
}
