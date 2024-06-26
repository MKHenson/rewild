import { ClientShape } from './ClientShape';
import { ClientVec3 } from './ClientVec3';
import { physicsWasm } from './WasmManager';

export class ClientHeightfield extends ClientShape {
  data: number[][] = [];
  elementSize: number;

  constructor(
    heightMatrix: number[][],
    sizeX: number,
    sizeZ: number,
    elementSize: number
  ) {
    //Flatten the matrix based on the sizes
    const heights = new Array<number>();
    for (let i = 0; i < sizeX; i++) {
      for (let j = 0; j < sizeZ; j++) {
        heights.push(heightMatrix[i][j]);
      }
    }

    super(physicsWasm.createHeightfield(heights, sizeX, sizeZ, elementSize));

    this.data = heightMatrix;
    this.elementSize = elementSize;
  }

  getConvexTrianglePillar(xi: number, yi: number, getUpperTriangle: boolean) {
    return physicsWasm.getHeightfieldConvexTrianglePillar(
      this.ptr,
      xi,
      yi,
      getUpperTriangle
    );
  }

  getPillarConvexAt(i: number): ClientVec3 {
    return new ClientVec3(
      physicsWasm.getHeightfieldPillarConvexAt(this.ptr, i)
    );
  }

  get pillarOffset(): ClientVec3 {
    return new ClientVec3(physicsWasm.getHeightfieldPillarOffset(this.ptr));
  }
}
