import { Event, EventDispatcher } from 'rewild-common';
import { ClientBody } from './ClientBody';
import { ClientVec3 } from './ClientVec3';
import { physicsWasm } from './WasmManager';
import { ClientContactMaterial } from './ClientContactMaterial';
import { ClientContactEquation } from './ClientContactEquation';
import { ClientConstraint } from './ClientConstraint';
import { ClientSolver } from './ClientSolver';

export class ClientWorld extends EventDispatcher {
  ptr: any;
  gravity: ClientVec3;
  constraints: ClientConstraint[] = [];
  defaultContactMaterial: ClientContactMaterial;
  solver: ClientSolver;

  constructor() {
    super();
    this.ptr = physicsWasm.createWorld();
    this.gravity = new ClientVec3(physicsWasm.getWorldGravity(this.ptr));
    this.solver = new ClientSolver(this);

    physicsWasm.postStep = () => {
      this.dispatchEvent(new Event('postStep'));
    };

    this.defaultContactMaterial = new ClientContactMaterial(
      null,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      physicsWasm.getWorldContactMaterial(this.ptr)
    );
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

  get numContacts(): number {
    return physicsWasm.getWorldNumContacts(this.ptr);
  }

  addContactMaterial(contactMaterial: ClientContactMaterial): void {
    physicsWasm.addContactMaterialToWorld(this.ptr, contactMaterial.ptr);
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
