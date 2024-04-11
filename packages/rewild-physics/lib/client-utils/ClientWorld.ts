import { EventDispatcher } from 'rewild-common';
import { __Internref24, __Internref30 } from '../../build/release';
import { ClientBody } from './ClientBody';
import { ClientVec3 } from './ClientVec3';
import { physicsWasm } from './WasmManager';
import { ClientContactMaterial } from './ClientContactMaterial';
import { ClientContactEquation } from './ClientContactEquation';
import { ClientConstraint } from './ClientConstraint';

export class ClientWorld extends EventDispatcher {
  ptr: __Internref30;

  constraints: ClientConstraint[] = [];

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

  get gravity(): ClientVec3 {
    const vec3Ptr = physicsWasm.getWorldGravity(this.ptr);
    return new ClientVec3(vec3Ptr);
  }

  get defaultContactMaterial() {
    return new ClientContactMaterial(this);
  }

  get numContacts(): number {
    return physicsWasm.getWorldNumContacts(this.ptr);
  }

  getContactAt(index: i32): ClientContactEquation {
    const contactPtr = physicsWasm.getWorlContactAt(this.ptr, index);
    return new ClientContactEquation(contactPtr);
  }

  removeConstraint(constraint: ClientConstraint): void {
    this.constraints = this.constraints.filter((c) => c !== constraint);
    physicsWasm.worldRemoveConstraint(this.ptr, constraint.ptr);
  }

  addConstraint(constraint: ClientConstraint): void {
    this.constraints.push(constraint);
    physicsWasm.worldAddConstraint(this.ptr, constraint.ptr);
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
