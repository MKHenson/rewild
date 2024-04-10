import { ClientShape } from './ClientShape';
import { physicsWasm } from './WasmManager';

export class ClientParticle extends ClientShape {
  constructor(radius: number) {
    super(physicsWasm.createShapeSphere(radius));
  }
}
