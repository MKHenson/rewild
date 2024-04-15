import { ClientWorld } from './ClientWorld';
import { physicsWasm } from './WasmManager';

export class ClientSolver {
  ptr: any;

  constructor(world: ClientWorld) {
    this.ptr = physicsWasm.getWorldSolver(world.ptr);
  }

  set iterations(iterations: i32) {
    physicsWasm.setSolverIterations(this.ptr, iterations);
  }
}
