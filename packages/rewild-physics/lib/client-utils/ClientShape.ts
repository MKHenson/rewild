import { __Internref33 } from '../../build/release';
import { physicsWasm } from './WasmManager';

export class ClientShape {
  ptr: __Internref33;

  constructor(ptr: __Internref33) {
    this.ptr = ptr;
  }

  get type(): number {
    return physicsWasm.getShapeType(this.ptr);
  }
}
