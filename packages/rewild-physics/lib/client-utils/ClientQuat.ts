import { __Internref6 } from '../../build/release';
import { physicsWasm } from './WasmManager';

export class ClientQuat {
  ptr: __Internref6;

  constructor(ptr: __Internref6) {
    this.ptr = ptr;
  }

  get x(): number {
    return physicsWasm.getQuatX(this.ptr);
  }

  get y() {
    return physicsWasm.getQuatY(this.ptr);
  }

  get z() {
    return physicsWasm.getQuatZ(this.ptr);
  }

  get w() {
    return physicsWasm.getQuatW(this.ptr);
  }
}
