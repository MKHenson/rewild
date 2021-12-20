import { AttributeTypes, BufferGeometry } from "../core/BufferGeometry";
import { Float32BufferAttribute } from "../core/BufferAttribute";
import { Vector3 } from "../math/Vector3";
import { f32Array } from "../utils";

export class BoxGeometryParameters {
  public width: f32;
  public height: f32;
  public depth: f32;
  public widthSegments: u16;
  public heightSegments: u16;
  public depthSegments: u16;
}

class BoxGeometryBuilder {
  indices: u32[] = [];
  vertices: f32[] = [];
  normals: f32[] = [];
  uvs: f32[] = [];
  private numberOfVertices: u16 = 0;
  private groupStart: u16 = 0;

  constructor(public widthSegments: u16, public heightSegments: u16, public depthSegments: u16) {}

  buildPlane(
    u: u8,
    v: u8,
    w: u8,
    udir: f32,
    vdir: f32,
    width: f32,
    height: f32,
    depth: f32,
    gridX: u16,
    gridY: u16,
    materialIndex: u16,
    box: BoxGeometry
  ): void {
    const vertices = this.vertices;
    const indices = this.indices;
    const normals = this.normals;
    const uvs = this.uvs;
    const numberOfVertices = this.numberOfVertices;

    const segmentWidth: f32 = width / gridX;
    const segmentHeight: f32 = height / gridY;

    const widthHalf: f32 = width / 2;
    const heightHalf: f32 = height / 2;
    const depthHalf: f32 = depth / 2;

    const gridX1: u16 = gridX + 1;
    const gridY1: u16 = gridY + 1;

    let vertexCounter: u16 = 0;
    let groupCount: u16 = 0;

    const vector = new Vector3();

    // generate vertices, normals and uvs

    for (let iy: u16 = 0; iy < gridY1; iy++) {
      const y = iy * segmentHeight - heightHalf;

      for (let ix: u16 = 0; ix < gridX1; ix++) {
        const x: f32 = ix * segmentWidth - widthHalf;

        // set values to correct vector component

        vector.setByIndex(u, x * udir);
        vector.setByIndex(v, y * vdir);
        vector.setByIndex(w, depthHalf);

        // now apply vector to vertex buffer

        vertices.push(vector.x);
        vertices.push(vector.y);
        vertices.push(vector.z);

        // set values to correct vector component

        vector.setByIndex(u, 0);
        vector.setByIndex(v, 0);
        vector.setByIndex(w, depth > 0 ? 1 : -1);

        // now apply vector to normal buffer

        normals.push(vector.x);
        normals.push(vector.y);
        normals.push(vector.z);

        // uvs

        uvs.push(ix / gridX);
        uvs.push(1 - iy / gridY);

        // counters

        vertexCounter += 1;
      }
    }

    // indices

    // 1. you need three indices to draw a single face
    // 2. a single segment consists of two faces
    // 3. so we need to generate six (2*3) indices per segment

    for (let iy: u16 = 0; iy < gridY; iy++) {
      for (let ix: u16 = 0; ix < gridX; ix++) {
        const a: u16 = numberOfVertices + ix + gridX1 * iy;
        const b: u16 = numberOfVertices + ix + gridX1 * (iy + 1);
        const c: u16 = numberOfVertices + (ix + 1) + gridX1 * (iy + 1);
        const d: u16 = numberOfVertices + (ix + 1) + gridX1 * iy;

        // faces

        indices.push(a);
        indices.push(b);
        indices.push(d);

        indices.push(b);
        indices.push(c);
        indices.push(d);

        // increase counter

        groupCount += 6;
      }
    }

    // add a group to the geometry. this will ensure multi material support

    box.addGroup(this.groupStart, groupCount, materialIndex);

    // calculate new start value for groups

    this.groupStart += groupCount;

    // update total number of vertices

    this.numberOfVertices += vertexCounter;
  }
}

export class BoxGeometry extends BufferGeometry {
  parameters: BoxGeometryParameters;

  constructor(
    width: f32 = 1,
    height: f32 = 1,
    depth: f32 = 1,
    widthSegments: u16 = 1,
    heightSegments: u16 = 1,
    depthSegments: u16 = 1
  ) {
    super();

    this.type = "BoxGeometry";

    this.parameters = {
      width: width,
      height: height,
      depth: depth,
      widthSegments: widthSegments,
      heightSegments: heightSegments,
      depthSegments: depthSegments,
    };

    // segments
    const builder = new BoxGeometryBuilder(
      <u16>Math.floor(widthSegments),
      <u16>Math.floor(heightSegments),
      <u16>Math.floor(depthSegments)
    );

    // build each side of the box geometry

    builder.buildPlane(2, 1, 0, -1, -1, depth, height, width, depthSegments, heightSegments, 0, this); // px
    builder.buildPlane(2, 1, 0, 1, -1, depth, height, -width, depthSegments, heightSegments, 1, this); // nx
    builder.buildPlane(0, 2, 1, 1, 1, width, depth, height, widthSegments, depthSegments, 2, this); // py
    builder.buildPlane(0, 2, 1, 1, -1, width, depth, -height, widthSegments, depthSegments, 3, this); // ny
    builder.buildPlane(0, 1, 2, 1, -1, width, height, depth, widthSegments, heightSegments, 4, this); // pz
    builder.buildPlane(0, 1, 2, -1, -1, width, height, -depth, widthSegments, heightSegments, 5, this); // nz

    // build geometry

    this.setIndexes(builder.indices);
    this.setAttribute(AttributeTypes.POSITION, new Float32BufferAttribute(f32Array(builder.vertices), 3));
    this.setAttribute(AttributeTypes.NORMAL, new Float32BufferAttribute(f32Array(builder.normals), 3));
    this.setAttribute(AttributeTypes.UV, new Float32BufferAttribute(f32Array(builder.uvs), 2));
  }

  // static fromJSON( data ) {
  // 	return new BoxGeometry( data.width, data.height, data.depth, data.widthSegments, data.heightSegments, data.depthSegments );
  // }
}
