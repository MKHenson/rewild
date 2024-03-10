import { AABB } from '../collision/AABB';
import { Quaternion } from '../math/Quaternion';
import { Vec3 } from '../math/Vec3';
import { ConvexPolyhedron } from './ConvexPolyhedron';
import { Shape } from './Shape';

const getHeightAt_idx: i32[] = [];
const getHeightAt_weights = new Vec3();
const getHeightAt_a = new Vec3();
const getHeightAt_b = new Vec3();
const getHeightAt_c = new Vec3();
const getNormalAt_a = new Vec3();
const getNormalAt_b = new Vec3();
const getNormalAt_c = new Vec3();
const getNormalAt_e0 = new Vec3();
const getNormalAt_e1 = new Vec3();

// from https://en.wikipedia.org/wiki/Barycentric_coordinate_system
function barycentricWeights(
  x: f32,
  y: f32,
  ax: f32,
  ay: f32,
  bx: f32,
  by: f32,
  cx: f32,
  cy: f32,
  result: Vec3
): void {
  result.x =
    ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) /
    ((by - cy) * (ax - cx) + (cx - bx) * (ay - cy));
  result.y =
    ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) /
    ((by - cy) * (ax - cx) + (cx - bx) * (ay - cy));
  result.z = 1 - result.x - result.y;
}

export class Pillar {
  constructor(public convex: ConvexPolyhedron, public offset: Vec3) {}
}

export class Heightfield extends Shape {
  data: f32[][];
  maxValue: f32;
  minValue: f32;
  elementSize: f32;
  pillarConvex: ConvexPolyhedron;
  pillarOffset: Vec3;
  _cachedPillars: Map<string, Pillar>;
  cacheEnabled: boolean;

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
    super(Shape.HEIGHTFIELD);

    /**
     * An array of numbers, or height values, that are spread out along the x axis.
     * @property {array} data
     */
    this.data = data;

    /**
     * The width of each element
     * @property {number} elementSize
     * @todo elementSizeX and Y
     */
    this.elementSize = elementSize;

    // "i_j_isUpper" => { convex: ..., offset: ... }
    // for example:
    // _cachedPillars["0_2_1"]
    this._cachedPillars = new Map();

    this.pillarConvex = new ConvexPolyhedron();
    this.pillarOffset = new Vec3();
    this.cacheEnabled = true;

    if (isNaN<f32>(minValue)) {
      this.updateMinValue();
    } else this.minValue = minValue;

    if (isNaN<f32>(maxValue)) {
      this.updateMaxValue();
    } else this.maxValue = maxValue;

    this.updateBoundingSphereRadius();
  }

  /**
   * Call whenever you change the data array.
   * @method update
   */
  update(): void {
    this._cachedPillars.clear();
  }

  /**
   * Update the .minValue property
   * @method updateMinValue
   */
  updateMinValue(): void {
    const data = this.data;
    let minValue = data[0][0];
    for (let i: i32 = 0; i != data.length; i++) {
      for (let j: i32 = 0; j != data[i].length; j++) {
        const v = data[i][j];

        if (v < minValue) {
          minValue = v;
        }
      }
    }
    this.minValue = minValue;
  }

  /**
   * Update the .maxValue property
   * @method updateMaxValue
   */
  updateMaxValue(): void {
    const data = this.data;
    let maxValue = data[0][0];
    for (let i: i32 = 0; i != data.length; i++) {
      for (let j: i32 = 0; j != data[i].length; j++) {
        const v = data[i][j];
        if (v > maxValue) {
          maxValue = v;
        }
      }
    }
    this.maxValue = maxValue;
  }

  /**
   * Set the height value at an index. Don't forget to update maxValue and minValue after you're done.
   * @method setHeightValueAtIndex
   * @param {integer} xi
   * @param {integer} yi
   * @param {number} value
   */
  setHeightValueAtIndex(xi: i32, yi: i32, value: f32): void {
    const data = this.data;
    data[xi][yi] = value;

    // Invalidate cache
    this.clearCachedConvexTrianglePillar(xi, yi, false);
    if (xi > 0) {
      this.clearCachedConvexTrianglePillar(xi - 1, yi, true);
      this.clearCachedConvexTrianglePillar(xi - 1, yi, false);
    }
    if (yi > 0) {
      this.clearCachedConvexTrianglePillar(xi, yi - 1, true);
      this.clearCachedConvexTrianglePillar(xi, yi - 1, false);
    }
    if (yi > 0 && xi > 0) {
      this.clearCachedConvexTrianglePillar(xi - 1, yi - 1, true);
    }
  }

  /**
   * Get max/min in a rectangle in the matrix data
   * @method getRectMinMax
   * @param  {integer} iMinX
   * @param  {integer} iMinY
   * @param  {integer} iMaxX
   * @param  {integer} iMaxY
   * @param  {array} [result] An array to store the results in.
   * @return {array} The result array, if it was passed in. Minimum will be at position 0 and max at 1.
   */
  getRectMinMax(
    iMinX: i32,
    iMinY: i32,
    iMaxX: i32,
    iMaxY: i32,
    result: f32[]
  ): void {
    result = result || [];

    // Get max and min of the data
    const data = this.data;
    let max = this.minValue; // Set first value
    for (let i: i32 = iMinX; i <= iMaxX; i++) {
      for (let j: i32 = iMinY; j <= iMaxY; j++) {
        const height = data[i][j];
        if (height > max) {
          max = height;
        }
      }
    }

    result[0] = this.minValue;
    result[1] = max;
  }

  /**
   * Get the index of a local position on the heightfield. The indexes indicate the rectangles, so if your terrain is made of N x N height data points, you will have rectangle indexes ranging from 0 to N-1.
   * @method getIndexOfPosition
   * @param  {number} x
   * @param  {number} y
   * @param  {array} result Two-element array
   * @param  {boolean} clamp If the position should be clamped to the heightfield edge.
   * @return {boolean}
   */
  getIndexOfPosition(x: f32, y: f32, result: i32[], clamp: boolean): boolean {
    // Get the index of the data points to test against
    const w = this.elementSize;
    const data = this.data;
    let xi = i32(Mathf.floor(x / w));
    let yi = i32(Mathf.floor(y / w));

    result[0] = xi;
    result[1] = yi;

    if (clamp) {
      // Clamp index to edges
      if (xi < 0) {
        xi = 0;
      }
      if (yi < 0) {
        yi = 0;
      }
      if (xi >= data.length - 1) {
        xi = data.length - 1;
      }
      if (yi >= data[0].length - 1) {
        yi = data[0].length - 1;
      }
    }

    // Bail out if we are out of the terrain
    if (xi < 0 || yi < 0 || xi >= data.length - 1 || yi >= data[0].length - 1) {
      return false;
    }

    return true;
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
   * Get an AABB of a square in the heightfield
   * @param  {number} xi
   * @param  {number} yi
   * @param  {AABB} result
   */
  getAabbAtIndex(xi: f32, yi: f32, result: AABB): void {
    const data = this.data;
    const elementSize = this.elementSize;

    result.lowerBound.set(xi * elementSize, yi * elementSize, data[xi][yi]);
    result.upperBound.set(
      (xi + 1) * elementSize,
      (yi + 1) * elementSize,
      data[xi + 1][yi + 1]
    );
  }

  /**
   * Get the height in the heightfield at a given position
   * @param  {number} x
   * @param  {number} y
   * @param  {boolean} edgeClamp
   * @return {number}
   */
  getHeightAt(x: f32, y: f32, edgeClamp: boolean): f32 {
    const data = this.data;
    const a = getHeightAt_a;
    const b = getHeightAt_b;
    const c = getHeightAt_c;
    const idx = getHeightAt_idx;

    this.getIndexOfPosition(x, y, idx, edgeClamp);
    let xi = idx[0];
    let yi = idx[1];
    if (edgeClamp) {
      xi = i32(Mathf.min(f32(data.length) - 2, Mathf.max(0, f32(xi))));
      yi = i32(Mathf.min(f32(data[0].length) - 2, Mathf.max(0, f32(yi))));
    }
    const upper = this.getTriangleAt(x, y, edgeClamp, a, b, c);
    barycentricWeights(x, y, a.x, a.y, b.x, b.y, c.x, c.y, getHeightAt_weights);

    const w = getHeightAt_weights;

    if (upper) {
      // Top triangle verts
      return (
        data[xi + 1][yi + 1] * w.x +
        data[xi][yi + 1] * w.y +
        data[xi + 1][yi] * w.z
      );
    } else {
      // Top triangle verts
      return (
        data[xi][yi] * w.x + data[xi + 1][yi] * w.y + data[xi][yi + 1] * w.z
      );
    }
  }

  getCacheConvexTrianglePillarKey(
    xi: i32,
    yi: i32,
    getUpperTriangle: boolean
  ): string {
    return (
      xi.toString() +
      '_' +
      yi.toString() +
      '_' +
      (getUpperTriangle ? 1 : 0).toString()
    );
  }

  getCachedConvexTrianglePillar(
    xi: i32,
    yi: i32,
    getUpperTriangle: boolean
  ): Pillar | null {
    const index = this.getCacheConvexTrianglePillarKey(
      xi,
      yi,
      getUpperTriangle
    );

    if (this._cachedPillars.has(index))
      return this._cachedPillars.get(index) as Pillar;

    return null;
  }

  setCachedConvexTrianglePillar(
    xi: i32,
    yi: i32,
    getUpperTriangle: boolean,
    convex: ConvexPolyhedron,
    offset: Vec3
  ): void {
    this._cachedPillars.set(
      this.getCacheConvexTrianglePillarKey(xi, yi, getUpperTriangle),
      new Pillar(convex, offset)
    );
  }

  clearCachedConvexTrianglePillar(
    xi: i32,
    yi: i32,
    getUpperTriangle: boolean
  ): void {
    this._cachedPillars.delete(
      this.getCacheConvexTrianglePillarKey(xi, yi, getUpperTriangle)
    );
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
        (f32(yi) + 1) * elementSize,
        data[xi + 1][yi + 1]
      );
      b.set(
        f32(xi) * elementSize,
        (f32(yi) + 1) * elementSize,
        data[xi][yi + 1]
      );
      c.set(
        (f32(xi) + 1) * elementSize,
        f32(yi) * elementSize,
        data[xi + 1][yi]
      );
    } else {
      // Top triangle verts
      a.set(f32(xi) * elementSize, f32(yi) * elementSize, data[xi][yi]);
      b.set(
        (f32(xi) + 1) * elementSize,
        f32(yi) * elementSize,
        data[xi + 1][yi]
      );
      c.set(
        f32(xi) * elementSize,
        (f32(yi) + 1) * elementSize,
        data[xi][yi + 1]
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
        (f32(yi) + 0.25) * elementSize,
        h // vertical center
      );

      // Top triangle verts
      verts[0]!.set(-0.25 * elementSize, -0.25 * elementSize, data[xi][yi] - h);
      verts[1]!.set(
        0.75 * elementSize,
        -0.25 * elementSize,
        data[xi + 1][yi] - h
      );
      verts[2]!.set(
        -0.25 * elementSize,
        0.75 * elementSize,
        data[xi][yi + 1] - h
      );

      // bottom triangle verts
      verts[3]!.set(-0.25 * elementSize, -0.25 * elementSize, -h - 1);
      verts[4]!.set(0.75 * elementSize, -0.25 * elementSize, -h - 1);
      verts[5]!.set(-0.25 * elementSize, 0.75 * elementSize, -h - 1);

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

      // -y facing quad
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
        (f32(yi) + 0.75) * elementSize,
        h // vertical center
      );

      // Top triangle verts
      verts[0]!.set(
        0.25 * elementSize,
        0.25 * elementSize,
        data[xi + 1][yi + 1] - h
      );
      verts[1]!.set(
        -0.75 * elementSize,
        0.25 * elementSize,
        data[xi][yi + 1] - h
      );
      verts[2]!.set(
        0.25 * elementSize,
        -0.75 * elementSize,
        data[xi + 1][yi] - h
      );

      // bottom triangle verts
      verts[3]!.set(0.25 * elementSize, 0.25 * elementSize, -h - 1);
      verts[4]!.set(-0.75 * elementSize, 0.25 * elementSize, -h - 1);
      verts[5]!.set(0.25 * elementSize, -0.75 * elementSize, -h - 1);

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

      // +y facing quad
      faces[3][0] = 3;
      faces[3][1] = 4;
      faces[3][2] = 1;
      faces[3][3] = 0;

      // -xy facing quad
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

  calculateLocalInertia(mass: f32, target: Vec3 = new Vec3()): Vec3 {
    target.set(0, 0, 0);
    return target;
  }

  volume(): f32 {
    return f32.MAX_VALUE; // The terrain is infinite
  }

  calculateWorldAABB(pos: Vec3, quat: Quaternion, min: Vec3, max: Vec3): void {
    // TODO: do it properly
    min.set(-f32.MAX_VALUE, -f32.MAX_VALUE, -f32.MAX_VALUE);
    max.set(f32.MAX_VALUE, f32.MAX_VALUE, f32.MAX_VALUE);
  }

  updateBoundingSphereRadius(): void {
    // Use the bounding box of the min/max values
    const data = this.data,
      s = this.elementSize;
    this.boundingSphereRadius = new Vec3(
      f32(data.length) * s,
      f32(data[0].length) * s,
      Mathf.max(Mathf.abs(this.maxValue), Mathf.abs(this.minValue))
    ).norm();
  }

  //   /**
  //    * Sets the height values from an image. Currently only supported in browser.
  //    * @method setHeightsFromImage
  //    * @param {Image} image
  //    * @param {Vec3} scale
  //    */
  //   setHeightsFromImage(image, scale: f32): void {
  //     const canvas = document.createElement("canvas");
  //     canvas.width = image.width;
  //     canvas.height = image.height;
  //     const context = canvas.getContext("2d");
  //     context.drawImage(image, 0, 0);
  //     const imageData = context.getImageData(0, 0, image.width, image.height);

  //     const matrix = this.data;
  //     matrix.length = 0;
  //     this.elementSize = Mathf.abs(scale.x) / imageData.width;
  //     for (const i = 0; i < imageData.height; i++) {
  //       const row = [];
  //       for (const j = 0; j < imageData.width; j++) {
  //         const a = imageData.data[(i * imageData.height + j) * 4];
  //         const b = imageData.data[(i * imageData.height + j) * 4 + 1];
  //         const c = imageData.data[(i * imageData.height + j) * 4 + 2];
  //         const height = ((a + b + c) / 4 / 255) * scale.z;
  //         if (scale.x < 0) {
  //           row.push(height);
  //         } else {
  //           row.unshift(height);
  //         }
  //       }
  //       if (scale.y < 0) {
  //         matrix.unshift(row);
  //       } else {
  //         matrix.push(row);
  //       }
  //     }
  //     this.updateMaxValue();
  //     this.updateMinValue();
  //     this.update();
  //   }
}
