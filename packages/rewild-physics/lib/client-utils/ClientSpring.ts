import { ClientBody } from './ClientBody';
import { physicsWasm } from './WasmManager';

export class ClientSpring {
  ptr: any;

  constructor(
    bodyA: ClientBody,
    bodyB: ClientBody,
    ptr: any = physicsWasm.createSpring(bodyA.ptr, bodyB.ptr)
  ) {
    this.ptr = ptr;
  }

  setRestLength(restLength: f32): void {
    physicsWasm.setSpringRestLength(this.ptr, restLength);
  }

  setStiffness(stiffness: f32): void {
    physicsWasm.setSpringStiffness(this.ptr, stiffness);
  }

  setDamping(damping: f32): void {
    physicsWasm.setSpringDamping(this.ptr, damping);
  }

  setlocalAnchorA(localAnchorA: any): void {
    physicsWasm.setSpringLocalAnchorA(this.ptr, localAnchorA.ptr);
  }

  setlocalAnchorB(localAnchorB: any): void {
    physicsWasm.setSpringLocalAnchorB(this.ptr, localAnchorB.ptr);
  }

  applyForce(): void {
    physicsWasm.applySpringForce(this.ptr);
  }
}
