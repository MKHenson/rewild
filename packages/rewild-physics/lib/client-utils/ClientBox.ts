import { ClientShape } from './ClientShape';
import { physicsWasm } from './WasmManager';

export class ClientBox extends ClientShape {
  halfExtentsX: number;
  halfExtentsY: number;
  halfExtentsZ: number;

  constructor(x: number, y: number, z: number) {
    super(physicsWasm.createShapeBox(x, y, z));
    this.halfExtentsX = x;
    this.halfExtentsY = y;
    this.halfExtentsZ = z;
  }

  get halfExtents() {
    return { x: this.halfExtentsX, y: this.halfExtentsY, z: this.halfExtentsZ };
  }
}
