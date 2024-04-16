import { physicsWasm } from './WasmManager';

export class ClientVec3 {
  ptr: any;

  constructor(ptr: any = physicsWasm.createVec3()) {
    this.ptr = ptr;
  }

  get x(): number {
    return physicsWasm.getVec3X(this.ptr);
  }

  set x(value: number) {
    physicsWasm.setVec3X(this.ptr, value);
  }

  get y() {
    return physicsWasm.getVec3Y(this.ptr);
  }

  set y(value: number) {
    physicsWasm.setVec3Y(this.ptr, value);
  }

  get z() {
    return physicsWasm.getVec3Z(this.ptr);
  }

  set z(value: number) {
    physicsWasm.setVec3Z(this.ptr, value);
  }

  set(x: number, y: number, z: number): ClientVec3 {
    physicsWasm.setVec3(this.ptr, x, y, z);
    return this;
  }

  vadd(v: ClientVec3, target: ClientVec3): ClientVec3 {
    physicsWasm.vec3VAdd(this.ptr, v.ptr, target.ptr);
    return this;
  }
}
