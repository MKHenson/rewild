import { __Internref48 } from '../../build/release';
import { ClientWorld } from './ClientWorld';
import { physicsWasm } from './WasmManager';

export class ClientContactMaterial {
  ptr: __Internref48;

  constructor(world: ClientWorld) {
    this.ptr = physicsWasm.getWorldContactMaterial(world.ptr);
  }

  set contactEquationStiffness(value: number) {
    physicsWasm.setContactMaterialContactEquationData(this.ptr, value);
  }

  set contactEquationRelaxation(value: number) {
    physicsWasm.setContactMaterialContactEquationData(
      this.ptr,
      undefined,
      value
    );
  }
}
