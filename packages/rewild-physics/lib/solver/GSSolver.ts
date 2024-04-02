import { Solver } from '../solver/Solver';
import { World } from '../world/World';

/**
 * Constraint equation Gauss-Seidel solver.
 * @todo The spook parameters should be specified for each constraint, not globally.
 * @see https://www8.cs.umu.se/kurser/5DV058/VT09/lectures/spooknotes.pdf
 */
export class GSSolver extends Solver {
  /**
   * The number of solver iterations determines quality of the constraints in the world.
   * The more iterations, the more correct simulation. More iterations need more computations though. If you have a large gravity force in your world, you will need more iterations.
   */
  iterations: i32;

  /**
   * When tolerance is reached, the system is assumed to be converged.
   */
  tolerance: f32;

  /**
   * @todo remove useless constructor
   */
  constructor() {
    super();

    this.iterations = 10;
    this.tolerance = 1e-7;
  }

  /**
   * Solve
   * @return number of iterations performed
   */
  solve(dt: f32, world: World): i32 {
    let iter: i32 = 0;
    const maxIter = this.iterations;
    const tolSquared = this.tolerance * this.tolerance;
    const equations = this.equations;
    const Neq = equations.length;
    const bodies = world.bodies;
    const Nbodies = bodies.length;
    const h = dt;
    // let q;
    let B: f32;
    let invC: f32;
    let deltalambda: f32;
    let deltalambdaTot: f32;
    let GWlambda: f32;
    let lambdaj: f32;

    // Update solve mass
    if (Neq != 0) {
      for (let i: i32 = 0; i != Nbodies; i++) {
        bodies[i].updateSolveMassProperties();
      }
    }

    // Things that do not change during iteration can be computed once
    const invCs = GSSolver_solve_invCs;

    const Bs = GSSolver_solve_Bs;
    const lambda = GSSolver_solve_lambda;
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
      for (let i: i32 = 0; i != Nbodies; i++) {
        const b = bodies[i];
        const vlambda = b.vlambda;
        const wlambda = b.wlambda;
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
      for (let i: i32 = 0; i != Nbodies; i++) {
        const b = bodies[i];
        const v = b.velocity;
        const w = b.angularVelocity;

        b.vlambda.vmul(b.linearFactor, b.vlambda);
        v.vadd(b.vlambda, v);

        b.wlambda.vmul(b.angularFactor, b.wlambda);
        w.vadd(b.wlambda, w);
      }

      // Set the `.multiplier` property of each equation
      let l = equations.length;
      const invDt: f32 = 1 / h;
      while (l--) {
        equations[l].multiplier = lambda[l] * invDt;
      }
    }

    return iter;
  }
}

// Just temporary number holders that we want to reuse each iteration.
const GSSolver_solve_lambda: f32[] = [];
const GSSolver_solve_invCs: f32[] = [];
const GSSolver_solve_Bs: f32[] = [];
