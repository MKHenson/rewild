import { physicsWasm } from './WasmManager';

export class ClientShape {
  ptr: any;

  constructor(ptr: any) {
    this.ptr = ptr;
  }

  get type(): number {
    return physicsWasm.getShapeType(this.ptr);
  }
}
