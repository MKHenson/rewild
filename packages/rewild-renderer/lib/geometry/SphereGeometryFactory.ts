import { Geometry } from './Geometry';
import { Vector3 } from 'rewild-common';

export class SphereGeometryFactory {
  static new(
    radius: f32 = 1,
    widthSegments: u32 = 32,
    heightSegments: u32 = 16,
    phiStart: f32 = 0,
    phiLength: f32 = Mathf.PI * 2,
    thetaStart: f32 = 0,
    thetaLength: f32 = Mathf.PI
  ) {
    const geometry = new Geometry();

    widthSegments = <u32>Math.max(3, Math.floor(widthSegments));
    heightSegments = <u32>Math.max(2, Math.floor(heightSegments));

    const thetaEnd: f32 = Mathf.min(thetaStart + thetaLength, Mathf.PI);

    let index: u32 = 0;
    const grid: u32[][] = [];

    const vertex = new Vector3();
    const normal = new Vector3();

    // buffers
    const indices: u32[] = [];
    const vertices: f32[] = [];
    const normals: f32[] = [];
    const uvs: f32[] = [];

    // generate vertices, normals and uvs
    for (let iy: u32 = 0; iy <= heightSegments; iy++) {
      const verticesRow: u32[] = [];

      const v: f32 = iy / heightSegments;

      // special case for the poles
      let uOffset: f32 = 0;

      if (iy == 0 && thetaStart == 0) {
        uOffset = 0.5 / widthSegments;
      } else if (iy == heightSegments && thetaEnd == Mathf.PI) {
        uOffset = -0.5 / widthSegments;
      }

      for (let ix: u32 = 0; ix <= widthSegments; ix++) {
        const u: f32 = ix / widthSegments;

        // vertex
        vertex.x =
          -radius *
          Mathf.cos(phiStart + u * phiLength) *
          Mathf.sin(thetaStart + v * thetaLength);
        vertex.y = radius * Mathf.cos(thetaStart + v * thetaLength);
        vertex.z =
          radius *
          Mathf.sin(phiStart + u * phiLength) *
          Mathf.sin(thetaStart + v * thetaLength);

        vertices.push(vertex.x);
        vertices.push(vertex.y);
        vertices.push(vertex.z);

        // normal
        normal.copy(vertex).normalize();
        normals.push(normal.x);
        normals.push(normal.y);
        normals.push(normal.z);

        // uv
        uvs.push(u + uOffset);
        uvs.push(1 - v);

        verticesRow.push(index++);
      }

      grid.push(verticesRow);
    }

    // indices
    for (let iy: u32 = 0; iy < heightSegments; iy++) {
      for (let ix: u32 = 0; ix < widthSegments; ix++) {
        const a: u32 = grid[iy][ix + 1];
        const b: u32 = grid[iy][ix];
        const c: u32 = grid[iy + 1][ix];
        const d: u32 = grid[iy + 1][ix + 1];

        if (iy != 0 || thetaStart > 0) {
          indices.push(a);
          indices.push(b);
          indices.push(d);
        }
        if (iy != heightSegments - 1 || thetaEnd < Mathf.PI) {
          indices.push(b);
          indices.push(c);
          indices.push(d);
        }
      }
    }

    geometry.indices = new Uint16Array(indices);
    geometry.vertices = new Float32Array(vertices);
    geometry.normals = new Float32Array(normals);
    geometry.uvs = new Float32Array(uvs);
    return geometry;
  }
}
