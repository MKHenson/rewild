import { Vec3 } from '../math';
import { ClientShape } from './ClientShape';
import { physicsWasm } from './WasmManager';

export class ClientConvexPolyhedron extends ClientShape {
  vertices: Vec3[] = [];
  faces: number[][] = [];

  constructor(vertices: Vec3[], faces: number[][], ptr?: any) {
    // Convert the vertices array to a flat number array
    const verticesArray: number[] = [];
    for (let j = 0; j < vertices.length; j++) {
      verticesArray.push(vertices[j].x);
      verticesArray.push(vertices[j].y);
      verticesArray.push(vertices[j].z);
    }

    // Convert the faces array to a flat number array
    const facesArray: number[] = [];
    for (let j = 0; j < faces.length; j++) {
      facesArray.push(faces[j][0]);
      facesArray.push(faces[j][1]);
      facesArray.push(faces[j][2]);
    }

    super(
      ptr
        ? ptr
        : physicsWasm.createConvexPolyhedron(verticesArray, facesArray, 3)
    );

    this.vertices = vertices;
    this.faces = faces;
  }
}
