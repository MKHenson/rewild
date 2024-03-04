import { Object3D } from '../Object3D';
import { wasm } from '../WasmManager';

export class Camera extends Object3D {
  constructor() {
    super('Camera', wasm.getCamera());
  }
}
