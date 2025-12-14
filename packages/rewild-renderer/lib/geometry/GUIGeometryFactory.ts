import { Geometry } from './Geometry';

export class GUIGeometryFactory {
  static new() {
    const geometry = new Geometry();

    // prettier-ignore
    const vertexData = new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      1, 1,
    ]);

    const uvData = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

    // prettier-ignore
    const indexData = new Uint32Array([
      0,  1,  2,    2,  1,  3
    ]);

    geometry.indices = indexData;
    geometry.vertices = vertexData;
    geometry.uvs = uvData;
    return geometry;
  }
}
