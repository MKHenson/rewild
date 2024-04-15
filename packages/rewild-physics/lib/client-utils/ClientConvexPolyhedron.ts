import { Vec3 } from '../math';
import { ClientShape } from './ClientShape';
import { physicsWasm } from './WasmManager';

export class ClientConvexPolyhedron extends ClientShape {
  vertices: Vec3[] = [];
  faces: number[][] = [];

  constructor(vertices: number[], faces: number[], facesSize: number) {
    super(physicsWasm.createConvexPolyhedron(vertices, faces, facesSize));

    for (let i = 0; i < vertices.length; i += 3) {
      this.vertices.push(
        new Vec3(vertices[i], vertices[i + 1], vertices[i + 2])
      );
    }

    for (let i = 0; i < faces.length; i += facesSize) {
      const face = new Array<number>();
      for (let j = 0; j < facesSize; j++) {
        face.push(faces[i + j]);
      }
      this.faces.push(face);
    }
  }
}
