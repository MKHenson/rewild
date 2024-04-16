import { Vec3 } from '../math';
import { ClientConvexPolyhedron } from './ClientConvexPolyhedron';
import { ClientShape } from './ClientShape';
import { physicsWasm } from './WasmManager';

export class ClientBox extends ClientShape {
  halfExtentsX: number;
  halfExtentsY: number;
  halfExtentsZ: number;
  vertices: Vec3[] = [];
  faces: number[][] = [];

  constructor(x: number, y: number, z: number) {
    super(physicsWasm.createShapeBox(x, y, z));
    this.halfExtentsX = x;
    this.halfExtentsY = y;
    this.halfExtentsZ = z;
  }

  get halfExtents() {
    return { x: this.halfExtentsX, y: this.halfExtentsY, z: this.halfExtentsZ };
  }

  get convexPolyhedronRepresentation() {
    const sx = this.halfExtents.x;
    const sy = this.halfExtents.y;
    const sz = this.halfExtents.z;

    const vertices: Vec3[] = [
      new Vec3(-sx, -sy, -sz),
      new Vec3(sx, -sy, -sz),
      new Vec3(sx, sy, -sz),
      new Vec3(-sx, sy, -sz),
      new Vec3(-sx, -sy, sz),
      new Vec3(sx, -sy, sz),
      new Vec3(sx, sy, sz),
      new Vec3(-sx, sy, sz),
    ];

    const faces: number[][] = [
      [3, 2, 1, 0], // -z
      [4, 5, 6, 7], // +z
      [5, 4, 0, 1], // -y
      [2, 3, 7, 6], // +y
      [0, 4, 7, 3], // -x
      [1, 2, 6, 5], // +x
    ];

    return new ClientConvexPolyhedron(
      vertices,
      faces,
      physicsWasm.getBoxConvexPolyhedronRepresentation(this.ptr)
    );
  }
}
