import { Float32BufferAttribute, Uint16BufferAttribute } from "../core/BufferAttribute";
import { BufferGeometry } from "../core/BufferGeometry";
import { EngineVector2 } from "../math/Vector2";
import { EngineVector3 } from "../math/Vector3";
import { AttributeType } from "../../common/AttributeType";

export class CapsuleGeometryParameters {
  public radiusTop: f32;
  public radiusBottom: f32;
  public height: f32;
  public radialSegments: u16;
  public heightSegments: u16;
  public capsTopSegments: u16;
  public capsBottomSegments: u16;
  public thetaStart: f32;
  public thetaLength: f32;
}

class CapsuleGeometryBuilder {
  indices: Uint16BufferAttribute;
  vertices: Float32BufferAttribute;
  normals: Float32BufferAttribute;
  uvs: Float32BufferAttribute;

  index: u16 = 0;
  indexOffset: u16 = 0;
  indexArray: u16[][] = [];

  constructor(indexCount: u16, vertexCount: u16) {
    // buffers
    this.indices = new Uint16BufferAttribute(new Uint16Array(indexCount), 1);
    this.vertices = new Float32BufferAttribute(new Float32Array(vertexCount * 3), 3);
    this.normals = new Float32BufferAttribute(new Float32Array(vertexCount * 3), 3);
    this.uvs = new Float32BufferAttribute(new Float32Array(vertexCount * 2), 2);
  }

  generateTorso(params: CapsuleGeometryParameters, alpha: f32): void {
    const halfHeight: f32 = params.height / 2;
    const indexArray = this.indexArray;
    const indices = this.indices;
    const vertices = this.vertices;
    const normals = this.normals;
    const uvs = this.uvs;

    let x: u16, y: u16;
    const normal = new EngineVector3();
    const vertex = new EngineVector3();

    const cosAlpha = Mathf.cos(alpha);
    const sinAlpha = Mathf.sin(alpha);

    const cone_length: f32 = new EngineVector2(params.radiusTop * sinAlpha, halfHeight + params.radiusTop * cosAlpha)
      .sub(new EngineVector2(params.radiusBottom * sinAlpha, -halfHeight + params.radiusBottom * cosAlpha))
      .length();

    // Total length for v texture coord
    const vl: f32 = params.radiusTop * alpha + cone_length + params.radiusBottom * (Mathf.PI / 2 - alpha);

    // generate vertices, normals and uvs

    let v: f32 = 0;
    for (y = 0; y <= params.capsTopSegments; y++) {
      const indexRow: u16[] = [];

      const a: f32 = Mathf.PI / 2 - alpha * (f32(y) / f32(params.capsTopSegments));

      v += (params.radiusTop * alpha) / f32(params.capsTopSegments);

      const cosA = Mathf.cos(a);
      const sinA = Mathf.sin(a);

      // calculate the radius of the current row
      const radius = cosA * params.radiusTop;

      for (x = 0; x <= params.radialSegments; x++) {
        const u = f32(x) / f32(params.radialSegments);

        const theta = f32(u) * params.thetaLength + params.thetaStart;

        const sinTheta = Mathf.sin(theta);
        const cosTheta = Mathf.cos(theta);

        // vertex
        vertex.x = radius * sinTheta;
        vertex.y = halfHeight + sinA * params.radiusTop;
        vertex.z = radius * cosTheta;
        vertices.setXYZ(this.index, vertex.x, vertex.y, vertex.z);

        // normal
        normal.set(cosA * sinTheta, sinA, cosA * cosTheta);
        normals.setXYZ(this.index, normal.x, normal.y, normal.z);

        // uv
        uvs.setXY(this.index, f32(u), 1 - f32(v) / f32(vl));

        // save index of vertex in respective row
        indexRow.push(this.index);

        // increase index
        this.index++;
      }

      // now save vertices of the row in our index array
      indexArray.push(indexRow);
    }

    const cone_height: f32 = params.height + cosAlpha * params.radiusTop - cosAlpha * params.radiusBottom;
    const slope: f32 = (sinAlpha * (params.radiusBottom - params.radiusTop)) / cone_height;
    for (y = 1; y <= params.heightSegments; y++) {
      const indexRow: u16[] = [];

      v += cone_length / f32(params.heightSegments);

      // calculate the radius of the current row
      const radius =
        sinAlpha * ((y * (params.radiusBottom - params.radiusTop)) / params.heightSegments + params.radiusTop);

      for (x = 0; x <= params.radialSegments; x++) {
        const u: f32 = f32(x) / f32(params.radialSegments);

        const theta: f32 = u * params.thetaLength + params.thetaStart;

        const sinTheta: f32 = Mathf.sin(theta);
        const cosTheta: f32 = Mathf.cos(theta);

        // vertex
        vertex.x = radius * sinTheta;
        vertex.y = halfHeight + cosAlpha * params.radiusTop - (f32(y) * cone_height) / f32(params.heightSegments);
        vertex.z = radius * cosTheta;
        vertices.setXYZ(this.index, vertex.x, vertex.y, vertex.z);

        // normal
        normal.set(sinTheta, slope, cosTheta).normalize();
        normals.setXYZ(this.index, normal.x, normal.y, normal.z);

        // uv
        uvs.setXY(this.index, u, 1 - v / vl);

        // save index of vertex in respective row
        indexRow.push(this.index);

        // increase index
        this.index++;
      }

      // now save vertices of the row in our index array
      indexArray.push(indexRow);
    }

    for (y = 1; y <= params.capsBottomSegments; y++) {
      const indexRow: u16[] = [];

      const a: f32 = Mathf.PI / 2 - alpha - (Mathf.PI - alpha) * (f32(y) / f32(params.capsBottomSegments));

      v += (params.radiusBottom * alpha) / f32(params.capsBottomSegments);

      const cosA: f32 = Mathf.cos(a);
      const sinA: f32 = Mathf.sin(a);

      // calculate the radius of the current row
      const radius = cosA * params.radiusBottom;

      for (x = 0; x <= params.radialSegments; x++) {
        const u: f32 = f32(x) / f32(params.radialSegments);

        const theta: f32 = f32(u) * params.thetaLength + params.thetaStart;

        const sinTheta: f32 = Mathf.sin(theta);
        const cosTheta: f32 = Mathf.cos(theta);

        // vertex
        vertex.x = radius * sinTheta;
        vertex.y = -halfHeight + sinA * params.radiusBottom;
        vertex.z = radius * cosTheta;
        vertices.setXYZ(this.index, vertex.x, vertex.y, vertex.z);

        // normal
        normal.set(cosA * sinTheta, sinA, cosA * cosTheta);
        normals.setXYZ(this.index, normal.x, normal.y, normal.z);

        // uv
        uvs.setXY(this.index, u, 1 - v / vl);

        // save index of vertex in respective row
        indexRow.push(this.index);

        // increase index
        this.index++;
      }

      // now save vertices of the row in our index array
      indexArray.push(indexRow);
    }

    // generate indices

    for (x = 0; x < params.radialSegments; x++) {
      for (y = 0; y < params.capsTopSegments + params.heightSegments + params.capsBottomSegments; y++) {
        // we use the index array to access the correct indices
        const i1 = indexArray[y][x];
        const i2 = indexArray[y + 1][x];
        const i3 = indexArray[y + 1][x + 1];
        const i4 = indexArray[y][x + 1];

        // face one
        indices.setX(this.indexOffset, i1);
        this.indexOffset++;
        indices.setX(this.indexOffset, i2);
        this.indexOffset++;
        indices.setX(this.indexOffset, i4);
        this.indexOffset++;

        // face two
        indices.setX(this.indexOffset, i2);
        this.indexOffset++;
        indices.setX(this.indexOffset, i3);
        this.indexOffset++;
        indices.setX(this.indexOffset, i4);
        this.indexOffset++;
      }
    }
  }
}

export class CapsuleGeometry extends BufferGeometry {
  parameters: CapsuleGeometryParameters;

  constructor(
    radiusTop: f32 = 0.25,
    radiusBottom: f32 = 0.25,
    height: f32 = 0.5,
    radialSegments: u16 = 32,
    heightSegments: u16 = 1,
    capsTopSegments: u16 = 4,
    capsBottomSegments: u16 = 4,
    thetaStart: f32 = 0,
    thetaLength: f32 = Mathf.PI * 2
  ) {
    super();
    this.type = "CapsuleBufferGeometry";

    this.parameters = {
      radiusTop: radiusTop,
      radiusBottom: radiusBottom,
      height: height,
      radialSegments: radialSegments,
      heightSegments: heightSegments,
      thetaStart: thetaStart,
      thetaLength: thetaLength,
      capsTopSegments: capsTopSegments,
      capsBottomSegments: capsBottomSegments,
    };

    radialSegments = <u16>Math.floor(radialSegments);
    heightSegments = <u16>Math.floor(heightSegments);
    capsTopSegments = <u16>Math.floor(capsTopSegments);
    capsBottomSegments = <u16>Math.floor(capsBottomSegments);

    // Alpha is the angle such that Math.PI/2 - alpha is the cone part angle.
    const alpha: f32 = Mathf.acos((radiusBottom - radiusTop) / height);
    const vertexCount = (radialSegments + 1) * (heightSegments + 1 + capsBottomSegments + capsTopSegments);
    const indexCount = radialSegments * (heightSegments + capsBottomSegments + capsTopSegments) * 2 * 3;

    const builder = new CapsuleGeometryBuilder(indexCount, vertexCount);

    // generate geometry
    builder.generateTorso(this.parameters, alpha);

    // build geometry
    this.setIndexAttrbute(builder.indices);
    this.setAttribute(AttributeType.POSITION, builder.vertices);
    this.setAttribute(AttributeType.NORMAL, builder.normals);
    this.setAttribute(AttributeType.UV, builder.uvs);
  }
}
