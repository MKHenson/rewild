import { physicsWasm } from './WasmManager';

export class ClientQuat {
  ptr: any;

  constructor(ptr: any) {
    this.ptr = ptr;
  }

  get x(): number {
    return physicsWasm.getQuatX(this.ptr);
  }

  set x(value: number) {
    physicsWasm.setQuatX(this.ptr, value);
  }

  get y() {
    return physicsWasm.getQuatY(this.ptr);
  }

  set y(value: number) {
    physicsWasm.setQuatY(this.ptr, value);
  }

  get z() {
    return physicsWasm.getQuatZ(this.ptr);
  }

  set z(value: number) {
    physicsWasm.setQuatZ(this.ptr, value);
  }

  get w() {
    return physicsWasm.getQuatW(this.ptr);
  }

  set w(value: number) {
    physicsWasm.setQuatW(this.ptr, value);
  }

  set(x: number, y: number, z: number, w: number): void {
    physicsWasm.setQuatX(this.ptr, x);
    physicsWasm.setQuatY(this.ptr, y);
    physicsWasm.setQuatZ(this.ptr, z);
    physicsWasm.setQuatW(this.ptr, w);
  }

  setFromEuler(x: number, y: number, z: number): void {
    physicsWasm.setQuaternionFromEuler(this.ptr, x, y, z);
  }
}
