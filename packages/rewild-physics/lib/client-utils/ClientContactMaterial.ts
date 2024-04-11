import { ClientMaterial } from './ClientMaterial';
import { physicsWasm } from './WasmManager';

export class ClientContactMaterial {
  ptr: any;
  _contactEquationStiffness: number;
  _contactEquationRelaxation: number;

  constructor(
    materialA: ClientMaterial | null,
    materialB: ClientMaterial | null,
    friction: number = -1,
    restitution: number = -1,
    ptr: any = physicsWasm.createContactMaterial(
      materialA?.ptr,
      materialB?.ptr,
      friction,
      restitution
    )
  ) {
    this.ptr = ptr;
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
