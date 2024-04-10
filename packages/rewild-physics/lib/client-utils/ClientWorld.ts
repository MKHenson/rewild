import { EventDispatcher } from 'rewild-common';
import { __Internref24, __Internref30 } from '../../build/release';
import { ClientBody } from './ClientBody';
import { ClientVec3 } from './ClientVec3';
import { physicsWasm } from './WasmManager';
import { ClientContactMaterial } from './ClientContactMaterial';

export class ClientWorld extends EventDispatcher {
  ptr: __Internref30;

  constructor() {
    super();
    this.ptr = physicsWasm.createWorld();
  }

  get profile() {
    return {
      broadphase: 0,
      integrate: 0,
      makeContactConstraints: 0,
      narrowphase: 0,
      solve: 0,
    };
  }

  /** TODO: implment */
  get constraints() {
    return [];
  }

  get gravity(): ClientVec3 {
    const vec3Ptr = physicsWasm.getWorldGravity(this.ptr);
    return new ClientVec3(vec3Ptr);
  }

  get defaultContactMaterial() {
    return new ClientContactMaterial(this);
  }

  setGravity(x: number, y: number, z: number): void {
    physicsWasm.setWorldGravity(this.ptr, x, y, z);
  }

  addBody(body: ClientBody): void {
    physicsWasm.addBodyToWorld(this.ptr, body.ptr);
  }

  removeBody(body: ClientBody): void {
    physicsWasm.removeBodyFromWorld(this.ptr, body.ptr);
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
