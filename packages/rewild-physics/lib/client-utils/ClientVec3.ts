import { __Internref4 } from '../../build/release';
import { physicsWasm } from './WasmManager';

export class ClientVec3 {
  ptr: __Internref4;

  constructor(ptr: __Internref4) {
    this.ptr = ptr;
  }

  get x(): number {
    return physicsWasm.getVec3X(this.ptr);
  }

  get y() {
    return physicsWasm.getVec3Y(this.ptr);
  }

  get z() {
    return physicsWasm.getVec3Z(this.ptr);
  }
}
