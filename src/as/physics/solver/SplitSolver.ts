import { Equation } from "../equations/Equation";
import { Body } from "../objects/Body";
import { World } from "../world/World";
import { Solver } from "./Solver";

export class SplitSolverNode {
  constructor(
    public body: Body | null = null,
    public children: SplitSolverNode[] = [],
    public eqs: Equation[] = [],
    public visited = false
  ) {}
}

/**
 * Splits the equations into islands and solves them independently. Can improve performance.
 * @class SplitSolver
 * @constructor
 * @extends Solver
 * @param {Solver} subsolver
 */
export class SplitSolver extends Solver {
  iterations: f32;
  tolerance: f32;
  subsolver: Solver;
  nodes: SplitSolverNode[];
  nodePool: SplitSolverNode[];

  constructor(subsolver: Solver) {
    super();
    this.iterations = 10;
    this.tolerance = 1e-7;
    this.subsolver = subsolver;
    this.nodes = [];
    this.nodePool = [];

    // Create needed nodes, reuse if possible
    while (this.nodePool.length < 128) {
      this.nodePool.push(this.createNode());
    }
  }

  createNode(): SplitSolverNode {
    return new SplitSolverNode();
  }

  /**
   * Solve the subsystems
   * @method solve
   * @param  {Number} dt
   * @param  {World} world
   */
  solve(dt: f32, world: World): i32 | undefined {
    const nodes = SplitSolver_solve_nodes,
      nodePool = this.nodePool,
      bodies = world.bodies,
      equations = this.equations,
      Neq = equations.length,
      Nbodies = bodies.length,
      subsolver = this.subsolver;

    // Create needed nodes, reuse if possible
    while (nodePool.length < Nbodies) {
      nodePool.push(this.createNode());
    }
    nodes.length = Nbodies;
    for (let i: i32 = 0; i < Nbodies; i++) {
      nodes[i] = nodePool[i];
    }

    // Reset node values
    for (let i: i32 = 0; i !== Nbodies; i++) {
      const node = nodes[i];
      node.body = bodies[i];
      node.children.length = 0;
      node.eqs.length = 0;
      node.visited = false;
    }
    for (let k: i32 = 0; k !== Neq; k++) {
      const eq = equations[k],
        i = bodies.indexOf(eq.bi),
        j = bodies.indexOf(eq.bj),
        ni = nodes[i],
        nj = nodes[j];
      ni.children.push(nj);
      ni.eqs.push(eq);
      nj.children.push(ni);
      nj.eqs.push(eq);
    }

    let child,
      n: i32 = 0,
      eqs = SplitSolver_solve_eqs;

    subsolver.tolerance = this.tolerance;
    subsolver.iterations = this.iterations;

    const dummyWorld = SplitSolver_solve_dummyWorld;
    while ((child = getUnvisitedNode(nodes))) {
      eqs.length = 0;
      dummyWorld.bodies.length = 0;
      bfs(child, visitFunc, dummyWorld.bodies, eqs);

      const Neqs = eqs.length;

      eqs = eqs.sort(sortById);

      for (let i: i32 = 0; i !== Neqs; i++) {
        subsolver.addEquation(eqs[i]);
      }

      const iter = subsolver.solve(dt, dummyWorld);
      subsolver.removeAllEquations();
      n++;
    }

    return n;
  }
}

// Returns the number of subsystems
const SplitSolver_solve_nodes: SplitSolverNode[] = []; // All allocated node objects
const SplitSolver_solve_nodePool = []; // All allocated node objects
const SplitSolver_solve_eqs: Equation[] = []; // Temp array
const SplitSolver_solve_bds: SplitSolverNode[] = []; // Temp array
const SplitSolver_solve_dummyWorld = { bodies: [] }; // Temp object

const STATIC = Body.STATIC;

function getUnvisitedNode(nodes) {
  const Nnodes = nodes.length;
  for (let i: i32 = 0; i !== Nnodes; i++) {
    const node = nodes[i];
    if (!node.visited && !(node.body.type & STATIC)) {
      return node;
    }
  }
  return false;
}

const queue = [];

function bfs(root, visitFunc, bds, eqs) {
  queue.push(root);
  root.visited = true;
  visitFunc(root, bds, eqs);
  while (queue.length) {
    const node = queue.pop();
    // Loop over unvisited child nodes
    const child;
    while ((child = getUnvisitedNode(node.children))) {
      child.visited = true;
      visitFunc(child, bds, eqs);
      queue.push(child);
    }
  }
}

function visitFunc(node, bds, eqs) {
  bds.push(node.body);
  const Neqs = node.eqs.length;
  for (let i: i32 = 0; i !== Neqs; i++) {
    const eq = node.eqs[i];
    if (eqs.indexOf(eq) === -1) {
      eqs.push(eq);
    }
  }
}

function sortById(a: Equation, b: Equation): i32 {
  return b.id - a.id;
}
