import { Geometry } from './Geometry';

export class PlaneGeometryFactory {
  static new(
    width: f32 = 1,
    height: f32 = 1,
    widthSegments: u16 = 1,
    heightSegments: u16 = 1
  ) {
    const geometry = new Geometry();

    const width_half: f32 = width / 2;
    const height_half: f32 = height / 2;

    const gridX: u32 = u32(Math.floor(widthSegments));
    const gridY: u32 = u32(Math.floor(heightSegments));

    const gridX1: u32 = gridX + 1;
    const gridY1: u32 = gridY + 1;

    const segment_width = width / gridX;
    const segment_height = height / gridY;

    //

    const indices: u32[] = [];
    const vertices: f32[] = [];
    const normals: f32[] = [];
    const uvs: f32[] = [];

    for (let iy: u32 = 0; iy < gridY1; iy++) {
      const y: f32 = iy * segment_height - height_half;

      for (let ix: u32 = 0; ix < gridX1; ix++) {
        const x: f32 = ix * segment_width - width_half;

        vertices.push(x);
        vertices.push(-y);
        vertices.push(0);

        normals.push(0);
        normals.push(0);
        normals.push(1);

        uvs.push(ix / gridX);
        uvs.push(1 - iy / gridY);
      }
    }

    for (let iy: u32 = 0; iy < gridY; iy++) {
      for (let ix: u32 = 0; ix < gridX; ix++) {
        const a: u32 = ix + gridX1 * iy;
        const b: u32 = ix + gridX1 * (iy + 1);
        const c: u32 = ix + 1 + gridX1 * (iy + 1);
        const d: u32 = ix + 1 + gridX1 * iy;

        indices.push(a);
        indices.push(b);
        indices.push(d);
        indices.push(b);
        indices.push(c);
        indices.push(d);
      }
    }

    geometry.indices = new Uint16Array(indices);
    geometry.vertices = new Float32Array(vertices);
    geometry.normals = new Float32Array(normals);
    geometry.uvs = new Float32Array(uvs);
    return geometry;
  }
}
