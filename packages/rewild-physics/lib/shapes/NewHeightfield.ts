import { Vec3 } from '../math/Vec3';
import { ConvexPolyhedron } from './ConvexPolyhedron';
import {
  Heightfield,
  getHeightAt_idx,
  getNormalAt_a,
  getNormalAt_b,
  getNormalAt_c,
  getNormalAt_e0,
  getNormalAt_e1,
} from './Heightfield';

export class NewHeightfield extends Heightfield {
  /**
   * Heightfield shape class. Height data is given as an array. These data points are spread out evenly with a given distance.
   * @class Heightfield
   * @extends Shape
   * @constructor
   * @param {Array} data An array of Y values that will be used to construct the terrain.
   * @param {object} options
   * @param {Number} [options.minValue] Minimum value of the data points in the data array. Will be computed automatically if not given.
   * @param {Number} [options.maxValue] Maximum value.
   * @param {Number} [options.elementSize=0.1] World spacing between the data points in X direction.
   * @todo Should be possible to use along all axes, not just y
   * @todo should be possible to scale along all axes
   *
   * @example
   *     // Generate some height data (y-values).
   *     const data = [];
   *     for(const i = 0; i < 1000; i++){
   *         const y = 0.5 * Mathf.cos(0.2 * i);
   *         data.push(y);
   *     }
   *
   *     // Create the heightfield shape
   *     const heightfieldShape = new Heightfield(data, {
   *         elementSize: 1 // Distance between the data points in X and Y directions
   *     });
   *     const heightfieldBody = new Body();
   *     heightfieldBody.addShape(heightfieldShape);
   *     world.addBody(heightfieldBody);
   */
  constructor(
    data: f32[][],
    maxValue: f32 = f32.NaN,
    minValue: f32 = f32.NaN,
    elementSize: f32 = 1
  ) {
    super(data, maxValue, minValue, elementSize);
  }

  getTriangleAt(
    x: f32,
    y: f32,
    edgeClamp: boolean,
    a: Vec3,
    b: Vec3,
    c: Vec3
  ): boolean {
    const idx = getHeightAt_idx;
    this.getIndexOfPosition(x, y, idx, edgeClamp);
    let xi = idx[0];
    let yi = idx[1];

    const data = this.data;
    if (edgeClamp) {
      xi = i32(Mathf.min(f32(data.length) - 2, Mathf.max(0, f32(xi))));
      yi = i32(Mathf.min(f32(data[0].length) - 2, Mathf.max(0, f32(yi))));
    }

    const elementSize = f32(this.elementSize);
    const lowerDist2 =
      Mathf.pow(x / elementSize - f32(xi), 2) +
      Mathf.pow(y / elementSize - f32(yi), 2);
    const upperDist2 =
      Mathf.pow(x / elementSize - (f32(xi) + 1), 2) +
      Mathf.pow(y / elementSize - (f32(yi) + 1), 2);
    const upper = lowerDist2 > upperDist2;
    this.getTriangle(xi, yi, upper, a, b, c);
    return upper;
  }

  getNormalAt(x: f32, y: f32, edgeClamp: boolean, result: Vec3): void {
    const a = getNormalAt_a;
    const b = getNormalAt_b;
    const c = getNormalAt_c;
    const e0 = getNormalAt_e0;
    const e1 = getNormalAt_e1;
    this.getTriangleAt(x, y, edgeClamp, a, b, c);
    b.vsub(a, e0);
    c.vsub(a, e1);
    e0.cross(e1, result);
    result.normalize();
  }

  /**
   * Get a triangle from the heightfield
   * @param  {number} xi
   * @param  {number} yi
   * @param  {boolean} upper
   * @param  {Vec3} a
   * @param  {Vec3} b
   * @param  {Vec3} c
   */
  getTriangle(
    xi: i32,
    yi: i32,
    upper: boolean,
    a: Vec3,
    b: Vec3,
    c: Vec3
  ): void {
    const data = this.data;
    const elementSize = f32(this.elementSize);

    if (upper) {
      // Top triangle verts
      a.set(
        (f32(xi) + 1) * elementSize,
        data[xi + 1][yi + 1],
        (f32(yi) + 1) * elementSize
      );
      b.set(
        f32(xi) * elementSize,
        data[xi][yi + 1],
        (f32(yi) + 1) * elementSize
      );
      c.set(
        (f32(xi) + 1) * elementSize,
        data[xi + 1][yi],
        f32(yi) * elementSize
      );
    } else {
      // Top triangle verts
      a.set(f32(xi) * elementSize, data[xi][yi], f32(yi) * elementSize);
      b.set(
        (f32(xi) + 1) * elementSize,
        data[xi + 1][yi],
        f32(yi) * elementSize
      );
      c.set(
        f32(xi) * elementSize,
        data[xi][yi + 1],
        (f32(yi) + 1) * elementSize
      );
    }
  }

  /**
   * Get a triangle in the terrain in the form of a triangular convex shape.
   * @method getConvexTrianglePillar
   * @param  {integer} i
   * @param  {integer} j
   * @param  {boolean} getUpperTriangle
   */
  getConvexTrianglePillar(xi: i32, yi: i32, getUpperTriangle: boolean): void {
    let result = this.pillarConvex;
    let offsetResult = this.pillarOffset;

    if (this.cacheEnabled) {
      const data = this.getCachedConvexTrianglePillar(xi, yi, getUpperTriangle);
      if (data) {
        this.pillarConvex = data.convex;
        this.pillarOffset = data.offset;
        return;
      }

      result = new ConvexPolyhedron();
      offsetResult = new Vec3();

      this.pillarConvex = result;
      this.pillarOffset = offsetResult;
    }

    const data = this.data;
    const elementSize = this.elementSize;

    // Reuse verts if possible
    result.vertices.length = 6;
    for (let i: i32 = 0; i < 6; i++) {
      if (!result.vertices[i]) {
        result.vertices[i] = new Vec3();
      }
    }

    // Reuse faces if possible
    if (result.faces.length == 0) {
      const newFaces = new Array<i32[]>(5);

      for (let i: i32 = 0; i < 5; i++) {
        newFaces[i] = new Array<i32>();
      }

      result.faces = newFaces;
    }

    // result.faces = result.faces.length == 0 ? new Array<i32[] | null>(5) : result.faces;
    const faces = result.faces;

    // for (let i: i32 = 0; i < 5; i++) {
    //   if (!faces[i]) {
    //     faces[i] = new Array<i32>();
    //   }
    // }

    const verts = result.vertices;

    const minA: f32 = Mathf.min(data[xi][yi], data[xi + 1][yi]);
    const minB: f32 = Mathf.min(data[xi][yi + 1], data[xi + 1][yi + 1]);
    const h = (Mathf.min(minA, minB) - this.minValue) / 2 + this.minValue;

    if (!getUpperTriangle) {
      // Center of the triangle pillar - all polygons are given relative to this one
      offsetResult.set(
        (f32(xi) + 0.25) * elementSize, // sort of center of a triangle
        h, // vertical center
        (f32(yi) + 0.25) * elementSize
      );

      // Top triangle verts
      verts[0]!.set(-0.25 * elementSize, data[xi][yi] - h, 0.25 * elementSize);
      verts[1]!.set(
        0.75 * elementSize,
        data[xi + 1][yi] - h,
        0.25 * elementSize
      );
      verts[2]!.set(
        -0.25 * elementSize,
        data[xi][yi + 1] - h,
        -0.75 * elementSize
      );

      // bottom triangle verts
      verts[3]!.set(-0.25 * elementSize, -h - 1, 0.25 * elementSize);
      verts[4]!.set(0.75 * elementSize, -h - 1, 0.25 * elementSize);
      verts[5]!.set(-0.25 * elementSize, -h - 1, 0.75 * elementSize);

      // top triangle
      faces[0][0] = 0;
      faces[0][1] = 1;
      faces[0][2] = 2;

      // bottom triangle
      faces[1][0] = 5;
      faces[1][1] = 4;
      faces[1][2] = 3;

      // -x facing quad
      faces[2][0] = 0;
      faces[2][1] = 2;
      faces[2][2] = 5;
      faces[2][3] = 3;

      // +z facing quad
      faces[3][0] = 1;
      faces[3][1] = 0;
      faces[3][2] = 3;
      faces[3][3] = 4;

      // +xy facing quad
      faces[4][0] = 4;
      faces[4][1] = 5;
      faces[4][2] = 2;
      faces[4][3] = 1;
    } else {
      // Center of the triangle pillar - all polygons are given relative to this one
      offsetResult.set(
        (f32(xi) + 0.75) * elementSize, // sort of center of a triangle
        h, // vertical center
        (f32(yi) + 0.75) * elementSize
      );

      // Top triangle verts
      verts[0]!.set(
        0.25 * elementSize,
        data[xi + 1][yi + 1] - h,
        -0.25 * elementSize
      );
      verts[1]!.set(
        -0.75 * elementSize,
        data[xi][yi + 1] - h,
        -0.25 * elementSize
      );
      verts[2]!.set(
        0.25 * elementSize,
        data[xi + 1][yi] - h,
        0.75 * elementSize
      );

      // bottom triangle verts
      verts[3]!.set(0.25 * elementSize, -h - 1, -0.25 * elementSize);
      verts[4]!.set(-0.75 * elementSize, -h - 1, -0.25 * elementSize);
      verts[5]!.set(0.25 * elementSize, -h - 1, 0.75 * elementSize);

      // Top triangle
      faces[0][0] = 0;
      faces[0][1] = 1;
      faces[0][2] = 2;

      // bottom triangle
      faces[1][0] = 5;
      faces[1][1] = 4;
      faces[1][2] = 3;

      // +x facing quad
      faces[2][0] = 2;
      faces[2][1] = 5;
      faces[2][2] = 3;
      faces[2][3] = 0;

      // -z facing quad
      faces[3][0] = 3;
      faces[3][1] = 4;
      faces[3][2] = 1;
      faces[3][3] = 0;

      // -x +z facing quad
      faces[4][0] = 1;
      faces[4][1] = 4;
      faces[4][2] = 5;
      faces[4][3] = 2;
    }

    result.computeNormals();
    result.computeEdges();
    result.updateBoundingSphereRadius();

    this.setCachedConvexTrianglePillar(
      xi,
      yi,
      getUpperTriangle,
      result,
      offsetResult
    );
  }
}
