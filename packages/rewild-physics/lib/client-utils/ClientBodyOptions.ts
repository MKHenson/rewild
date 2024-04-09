import { __Internref64 } from '../../build/release';
import { physicsWasm } from './WasmManager';

export class ClientBodyOptions {
  ptr: __Internref64;

  constructor() {
    this.ptr = physicsWasm.createBodyOptions();
  }

  setMass(mass: number): void {
    physicsWasm.setBodyOptionsMass(this.ptr, mass);
  }
}
