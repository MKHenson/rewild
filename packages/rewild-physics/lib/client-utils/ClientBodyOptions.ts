import { ClientMaterial } from './ClientMaterial';
import { physicsWasm } from './WasmManager';

export class ClientBodyOptions {
  ptr: any;

  constructor() {
    this.ptr = physicsWasm.createBodyOptions();
  }

  setMass(mass: number): ClientBodyOptions {
    physicsWasm.setBodyOptionsMass(this.ptr, mass);
    return this;
  }

  setType(type: number): ClientBodyOptions {
    physicsWasm.setBodyOptionsType(this.ptr, type);
    return this;
  }

  setPosition(x: number, y: number, z: number): ClientBodyOptions {
    physicsWasm.setBodyOptionsPosition(this.ptr, x, y, z);
    return this;
  }

  setVelocity(x: number, y: number, z: number): ClientBodyOptions {
    physicsWasm.setBodyOptionsVelocity(this.ptr, x, y, z);
    return this;
  }

  setAngularVelocity(x: number, y: number, z: number): ClientBodyOptions {
    physicsWasm.setBodyOptionsAngularVelocity(this.ptr, x, y, z);
    return this;
  }

  setQuaternion(x: number, y: number, z: number, w: number): ClientBodyOptions {
    physicsWasm.setBodyOptionsQuaternion(this.ptr, x, y, z, w);
    return this;
  }

  setMaterial(material: ClientMaterial): ClientBodyOptions {
    physicsWasm.setBodyOptionsMaterial(this.ptr, material.ptr);
    return this;
  }

  setLinearDamping(damping: number): ClientBodyOptions {
    physicsWasm.setBodyOptionsLinearDamping(this.ptr, damping);
    return this;
  }
}
