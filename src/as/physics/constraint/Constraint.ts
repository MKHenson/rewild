import { PhysicsObject } from "../core/PhysicsObject";
import { RigidBody } from "../core/RigidBody";
import { World } from "../core/World";

/**
 * The base class of all type of the constraints.
 *
 * @author saharan
 * @author lo-th
 */

export abstract class Constraint extends PhysicsObject {
  // parent world of the constraint.
  parent: World | null;

  // first body of the constraint.
  body1: RigidBody | null;

  // second body of the constraint.
  body2: RigidBody | null;

  // Internal
  addedToIsland: boolean;

  constructor() {
    super();
    this.parent = null;
    this.body1 = null;
    this.body2 = null;
    this.addedToIsland = false;
  }

  // Prepare for solving the constraint
  abstract preSolve(timeStep: f32, invTimeStep: f32): void;

  // Solve the constraint. This is usually called iteratively.
  abstract solve(): void;

  // Do the post-processing.
  abstract postSolve(): void;
}