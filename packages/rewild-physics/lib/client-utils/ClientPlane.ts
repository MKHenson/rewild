import { ClientShape } from './ClientShape';
import { physicsWasm } from './WasmManager';

export class ClientPlane extends ClientShape {
  constructor() {
    super(physicsWasm.createShapePlane());
  }
}
