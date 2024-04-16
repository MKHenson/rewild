import { ClientShape } from './ClientShape';
import { physicsWasm } from './WasmManager';

export class ClientCylinder extends ClientShape {
  radiusTop: number;
  radiusBottom: number;
  height: number;
  numSegments: number;

  constructor(
    radiusTop: number = 1,
    radiusBottom: number = 1,
    height: number = 1,
    numSegments: number = 8
  ) {
    super(
      physicsWasm.createCylinder(radiusTop, radiusBottom, height, numSegments)
    );

    this.radiusTop = radiusTop;
    this.radiusBottom = radiusBottom;
    this.height = height;
    this.numSegments = numSegments;
  }
}
