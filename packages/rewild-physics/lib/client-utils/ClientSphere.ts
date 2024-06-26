import { ClientShape } from './ClientShape';
import { physicsWasm } from './WasmManager';

export class ClientSphere extends ClientShape {
  radius: number;
  constructor(radius: number) {
    super(physicsWasm.createShapeSphere(radius));
    this.radius = radius;
  }
}
