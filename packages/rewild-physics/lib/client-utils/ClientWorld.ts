import { __Internref24, __Internref30 } from '../../build/release';
import { ClientBody } from './ClientBody';
import { ClientVec3 } from './ClientVec3';
import { physicsWasm } from './WasmManager';

export class ClientWorld {
  ptr: __Internref30;

  constructor() {
    this.ptr = physicsWasm.createWorld();
  }

  gravity(): ClientVec3 {
    const vec3Ptr = physicsWasm.getWorldGravity(this.ptr);
    return new ClientVec3(vec3Ptr);
  }

  addBody(body: ClientBody): void {
    physicsWasm.addBodyToWorld(this.ptr, body.ptr);
  }

  removeBody(body: ClientBody): void {
    physicsWasm.removeBodyFromWorld(this.ptr, body.ptr);
  }

  setGravity(x: number, y: number, z: number): void {
    physicsWasm.setWorldGravity(this.ptr, x, y, z);
  }

  get worldIterations(): number {
    return physicsWasm.getWorldSolverIterations(this.ptr);
  }

  get quatNormalizeSkip(): number {
    return physicsWasm.getWorldQuatNormalizeSkip(this.ptr);
  }

  get quatNormalizeFast(): boolean {
    return physicsWasm.getWorldQuatNormalizeFast(this.ptr);
  }

  step(
    timeStep: number,
    timeSinceLastCalled: number = 0,
    maxSubSteps: number = 10
  ): void {
    physicsWasm.stepWorld(this.ptr, timeStep, timeSinceLastCalled, maxSubSteps);
  }
}
