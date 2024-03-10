import { wasm } from '../WasmManager';
import { Object3D } from '../Object3D';

export class Terrain extends Object3D {
  constructor() {
    super('Terrain', wasm.createTerrain());
  }
}
