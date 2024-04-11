import { ClientWorld } from './ClientWorld';
import { physicsWasm } from './WasmManager';

export class ClientContactMaterial {
  ptr: any;
  _contactEquationStiffness: number;
  _contactEquationRelaxation: number;

  constructor(world: ClientWorld) {
    this.ptr = physicsWasm.getWorldContactMaterial(world.ptr);
  }

  set contactEquationStiffness(value: number) {
    this._contactEquationStiffness = value;
    physicsWasm.setContactMaterialContactEquationData(this.ptr, value);
  }

  get contactEquationStiffness(): number {
    return this._contactEquationStiffness;
  }

  set contactEquationRelaxation(value: number) {
    physicsWasm.setContactMaterialContactEquationData(
      this.ptr,
      undefined,
      value
    );
    this._contactEquationRelaxation = value;
  }

  get contactEquationRelaxation(): number {
    return this._contactEquationRelaxation;
  }
}
