import { Geometry } from './Geometry';
import { Vector3 } from 'rewild-common';

export class CylinderGeometryFactory {
  static new(
    radiusTop: f32 = 1,
    radiusBottom: f32 = 1,
    height: f32 = 1,
    radialSegments: u32 = 32,
    heightSegments: u32 = 1,
    openEnded: boolean = false,
    thetaStart: f32 = 0,
    thetaLength: f32 = Mathf.PI * 2
  ) {
    const geometry = new Geometry();

    radialSegments = <u32>Math.max(3, Math.floor(radialSegments));
    heightSegments = <u32>Math.max(1, Math.floor(heightSegments));

    const indices: u32[] = [];
    const vertices: f32[] = [];
    const normals: f32[] = [];
    const uvs: f32[] = [];

    let index: u32 = 0;
    const indexArray: u32[][] = [];
    const halfHeight: f32 = height / 2;

    const normal = new Vector3();
    const vertex = new Vector3();

    // slope used for normal calculation
    const slope: f32 = (radiusBottom - radiusTop) / height;

    // generate torso

    for (let y: u32 = 0; y <= heightSegments; y++) {
      const indexRow: u32[] = [];

      const v: f32 = y / heightSegments;

      // interpolate radius from top to bottom
      const currentRadius: f32 = v * (radiusBottom - radiusTop) + radiusTop;

      for (let x: u32 = 0; x <= radialSegments; x++) {
        const u: f32 = x / radialSegments;

        const theta: f32 = u * thetaLength + thetaStart;

        const sinTheta: f32 = Mathf.sin(theta);
        const cosTheta: f32 = Mathf.cos(theta);

        // vertex
        vertex.x = currentRadius * sinTheta;
        vertex.y = -v * height + halfHeight;
        vertex.z = currentRadius * cosTheta;
        vertices.push(vertex.x);
        vertices.push(vertex.y);
        vertices.push(vertex.z);

        // normal
        normal.set(sinTheta, slope, cosTheta).normalize();
        normals.push(normal.x);
        normals.push(normal.y);
        normals.push(normal.z);

        // uv
        uvs.push(u);
        uvs.push(1 - v);

        indexRow.push(index++);
      }

      indexArray.push(indexRow);
    }

    // generate indices for torso

    for (let x: u32 = 0; x < radialSegments; x++) {
      for (let y: u32 = 0; y < heightSegments; y++) {
        const a: u32 = indexArray[y][x];
        const b: u32 = indexArray[y + 1][x];
        const c: u32 = indexArray[y + 1][x + 1];
        const d: u32 = indexArray[y][x + 1];

        if (radiusTop > 0 || y !== 0) {
          indices.push(a);
          indices.push(b);
          indices.push(d);
        }

        if (radiusBottom > 0 || y !== heightSegments - 1) {
          indices.push(b);
          indices.push(c);
          indices.push(d);
        }
      }
    }

    // generate caps

    if (openEnded === false) {
      if (radiusTop > 0) generateCap(true);
      if (radiusBottom > 0) generateCap(false);
    }

    function generateCap(top: boolean): void {
      const centerIndexStart: u32 = index;

      const capRadius: f32 = top ? radiusTop : radiusBottom;
      const sign: f32 = top ? 1 : -1;

      // center vertex per segment (needed for per-face UVs)
      for (let x: u32 = 1; x <= radialSegments; x++) {
        vertices.push(0);
        vertices.push(halfHeight * sign);
        vertices.push(0);

        normals.push(0);
        normals.push(sign);
        normals.push(0);

        uvs.push(0.5);
        uvs.push(0.5);

        index++;
      }

      const centerIndexEnd: u32 = index;

      // surrounding ring vertices
      for (let x: u32 = 0; x <= radialSegments; x++) {
        const u: f32 = x / radialSegments;
        const theta: f32 = u * thetaLength + thetaStart;

        const cosTheta: f32 = Mathf.cos(theta);
        const sinTheta: f32 = Mathf.sin(theta);

        // vertex
        vertex.x = capRadius * sinTheta;
        vertex.y = halfHeight * sign;
        vertex.z = capRadius * cosTheta;
        vertices.push(vertex.x);
        vertices.push(vertex.y);
        vertices.push(vertex.z);

        // normal
        normals.push(0);
        normals.push(sign);
        normals.push(0);

        // uv
        uvs.push(cosTheta * 0.5 + 0.5);
        uvs.push(sinTheta * 0.5 * sign + 0.5);

        index++;
      }

      // generate indices for cap
      for (let x: u32 = 0; x < radialSegments; x++) {
        const c: u32 = centerIndexStart + x;
        const i: u32 = centerIndexEnd + x;

        if (top) {
          indices.push(i);
          indices.push(i + 1);
          indices.push(c);
        } else {
          indices.push(i + 1);
          indices.push(i);
          indices.push(c);
        }
      }
    }

    geometry.indices = new Uint32Array(indices);
    geometry.vertices = new Float32Array(vertices);
    geometry.normals = new Float32Array(normals);
    geometry.uvs = new Float32Array(uvs);
    return geometry;
  }
}
