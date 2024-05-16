import { ClientShape } from './ClientShape';
import { physicsWasm } from './WasmManager';

export class ClientParticle extends ClientShape {
  constructor() {
    super(physicsWasm.createShapeParticle());
  }
}
