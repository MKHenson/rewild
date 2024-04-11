import { physicsWasm } from './WasmManager';

export class ClientMaterial {
  ptr: any;

  constructor(
    name: string = '',
    friction: number = -1,
    restitution: number = -1
  ) {
    this.ptr = physicsWasm.createMaterial(name, friction, restitution);
  }
}
