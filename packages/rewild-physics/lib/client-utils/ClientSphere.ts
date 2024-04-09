import { ClientShape } from './ClientShape';
import { physicsWasm } from './WasmManager';

export class ClientSphere extends ClientShape {
  constructor(radius: number) {
    super(physicsWasm.createShapeSphere(radius));
  }
}
