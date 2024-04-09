import { ClientShape } from './ClientShape';
import { physicsWasm } from './WasmManager';

export class ClientBox extends ClientShape {
  constructor(x: number, y: number, z: number) {
    super(physicsWasm.createShapeBox(x, y, z));
  }
}
