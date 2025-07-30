import { Matrix4 } from './Matrix4';
import { Quaternion } from './Quaternion';

export class Vector4 {
  x: f32;
  y: f32;
  z: f32;
  w: f32;

  constructor(x: f32 = 0, y: f32 = 0, z: f32 = 0, w: f32 = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  get width(): f32 {
    return this.z;
  }

  set width(value: f32) {
    this.z = value;
  }

  get height(): f32 {
    return this.w;
  }

  set height(value: f32) {
    this.w = value;
  }

  set(x: f32, y: f32, z: f32, w: f32): Vector4 {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;

    return this;
  }

  setScalar(scalar: f32): Vector4 {
    this.x = scalar;
    this.y = scalar;
    this.z = scalar;
    this.w = scalar;

    return this;
  }

  fromBufferAttributeJs(
    attribute: Float32Array,
    index: i32,
    itemSize: i32
  ): Vector4 {
    this.x = attribute[index * itemSize];
    this.y = attribute[index * itemSize + 1];
    this.z = attribute[index * itemSize + 2];
    this.w = attribute[index * itemSize + 3];

    return this;
  }

  setX(x: f32): Vector4 {
    this.x = x;

    return this;
  }

  setY(y: f32): Vector4 {
    this.y = y;

    return this;
  }

  setZ(z: f32): Vector4 {
    this.z = z;

    return this;
  }

  setW(w: f32): Vector4 {
    this.w = w;

    return this;
  }

  setComponent(index: u32, value: f32): Vector4 {
    switch (index) {
      case 0:
        this.x = value;
        break;
      case 1:
        this.y = value;
        break;
      case 2:
        this.z = value;
        break;
      case 3:
        this.w = value;
        break;
      default:
        throw new Error('index is out of range: ' + index);
    }

    return this;
  }

  getComponent(index: u32): f32 {
    switch (index) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      case 2:
        return this.z;
      case 3:
        return this.w;
      default:
        throw new Error('index is out of range: ' + index);
    }
  }

  clone(): Vector4 {
    return new Vector4(this.x, this.y, this.z, this.w);
  }

  copy(v: Vector4): Vector4 {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    this.w = v.w;

    return this;
  }

  add(v: Vector4): Vector4 {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    this.w += v.w;

    return this;
  }

  addScalar(s: f32): Vector4 {
    this.x += s;
    this.y += s;
    this.z += s;
    this.w += s;

    return this;
  }

  addVectors(a: Vector4, b: Vector4): Vector4 {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    this.w = a.w + b.w;

    return this;
  }

  addScaledVector(v: Vector4, s: f32): Vector4 {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    this.w += v.w * s;

    return this;
  }

  sub(v: Vector4): Vector4 {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    this.w -= v.w;

    return this;
  }

  subScalar(s: f32): Vector4 {
    this.x -= s;
    this.y -= s;
    this.z -= s;
    this.w -= s;

    return this;
  }

  subVectors(a: Vector4, b: Vector4): Vector4 {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    this.w = a.w - b.w;

    return this;
  }

  multiply(v: Vector4): Vector4 {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    this.w *= v.w;

    return this;
  }

  multiplyScalar(scalar: f32): Vector4 {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    this.w *= scalar;

    return this;
  }

  applyMatrix4(m: Matrix4): Vector4 {
    const x = this.x,
      y = this.y,
      z = this.z,
      w = this.w;
    const e = m.elements;

    this.x = e[0] * x + e[4] * y + e[8] * z + e[12] * w;
    this.y = e[1] * x + e[5] * y + e[9] * z + e[13] * w;
    this.z = e[2] * x + e[6] * y + e[10] * z + e[14] * w;
    this.w = e[3] * x + e[7] * y + e[11] * z + e[15] * w;

    return this;
  }

  divideScalar(scalar: f32): Vector4 {
    return this.multiplyScalar(1 / scalar);
  }

  setAxisAngleFromQuaternion(q: Quaternion): Vector4 {
    // http://www.euclideanspace.com/maths/geometry/rotations/conversions/quaternionToAngle/index.htm

    // q is assumed to be normalized

    this.w = 2 * Mathf.acos(q.w);

    const s = Mathf.sqrt(1 - q.w * q.w);

    if (s < 0.0001) {
      this.x = 1;
      this.y = 0;
      this.z = 0;
    } else {
      this.x = q.x / s;
      this.y = q.y / s;
      this.z = q.z / s;
    }

    return this;
  }

  setAxisAngleFromRotationMatrix(m: Matrix4): Vector4 {
    // http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToAngle/index.htm

    // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

    let angle: f32, x: f32, y: f32, z: f32; // variables for result
    const epsilon: f32 = 0.01, // margin to allow for rounding errors
      epsilon2: f32 = 0.1, // margin to distinguish between 0 and 180 degrees
      te = m.elements,
      m11: f32 = te[0],
      m12: f32 = te[4],
      m13: f32 = te[8],
      m21: f32 = te[1],
      m22: f32 = te[5],
      m23: f32 = te[9],
      m31: f32 = te[2],
      m32: f32 = te[6],
      m33: f32 = te[10];

    if (
      Mathf.abs(m12 - m21) < epsilon &&
      Mathf.abs(m13 - m31) < epsilon &&
      Mathf.abs(m23 - m32) < epsilon
    ) {
      // singularity found
      // first check for identity matrix which must have +1 for all terms
      // in leading diagonal and zero in other terms

      if (
        Mathf.abs(m12 + m21) < epsilon2 &&
        Mathf.abs(m13 + m31) < epsilon2 &&
        Mathf.abs(m23 + m32) < epsilon2 &&
        Mathf.abs(m11 + m22 + m33 - 3) < epsilon2
      ) {
        // this singularity is identity matrix so angle = 0

        this.set(1, 0, 0, 0);

        return this; // zero angle, arbitrary axis
      }

      // otherwise this singularity is angle = 180

      angle = Mathf.PI;

      const xx: f32 = (m11 + 1) / 2;
      const yy: f32 = (m22 + 1) / 2;
      const zz: f32 = (m33 + 1) / 2;
      const xy: f32 = (m12 + m21) / 4;
      const xz: f32 = (m13 + m31) / 4;
      const yz: f32 = (m23 + m32) / 4;

      if (xx > yy && xx > zz) {
        // m11 is the largest diagonal term

        if (xx < epsilon) {
          x = 0;
          y = 0.707106781;
          z = 0.707106781;
        } else {
          x = Mathf.sqrt(xx);
          y = xy / x;
          z = xz / x;
        }
      } else if (yy > zz) {
        // m22 is the largest diagonal term

        if (yy < epsilon) {
          x = 0.707106781;
          y = 0;
          z = 0.707106781;
        } else {
          y = Mathf.sqrt(yy);
          x = xy / y;
          z = yz / y;
        }
      } else {
        // m33 is the largest diagonal term so base result on this

        if (zz < epsilon) {
          x = 0.707106781;
          y = 0.707106781;
          z = 0;
        } else {
          z = Mathf.sqrt(zz);
          x = xz / z;
          y = yz / z;
        }
      }

      this.set(x, y, z, angle);

      return this; // return 180 deg rotation
    }

    // as we have reached here there are no singularities so we can handle normally

    let s: f32 = Mathf.sqrt(
      (m32 - m23) * (m32 - m23) +
        (m13 - m31) * (m13 - m31) +
        (m21 - m12) * (m21 - m12)
    ); // used to normalize

    if (Mathf.abs(s) < 0.001) s = 1;

    // prevent divide by zero, should not happen if matrix is orthogonal and should be
    // caught by singularity test above, but I've left it in just in case

    this.x = (m32 - m23) / s;
    this.y = (m13 - m31) / s;
    this.z = (m21 - m12) / s;
    this.w = Mathf.acos((m11 + m22 + m33 - 1) / 2);

    return this;
  }

  min(v: Vector4): Vector4 {
    this.x = Mathf.min(this.x, v.x);
    this.y = Mathf.min(this.y, v.y);
    this.z = Mathf.min(this.z, v.z);
    this.w = Mathf.min(this.w, v.w);

    return this;
  }

  max(v: Vector4): Vector4 {
    this.x = Mathf.max(this.x, v.x);
    this.y = Mathf.max(this.y, v.y);
    this.z = Mathf.max(this.z, v.z);
    this.w = Mathf.max(this.w, v.w);

    return this;
  }

  clamp(min: Vector4, max: Vector4): Vector4 {
    // assumes min < max, componentwise

    this.x = Mathf.max(min.x, Mathf.min(max.x, this.x));
    this.y = Mathf.max(min.y, Mathf.min(max.y, this.y));
    this.z = Mathf.max(min.z, Mathf.min(max.z, this.z));
    this.w = Mathf.max(min.w, Mathf.min(max.w, this.w));

    return this;
  }

  clampScalar(minVal: f32, maxVal: f32): Vector4 {
    this.x = Mathf.max(minVal, Mathf.min(maxVal, this.x));
    this.y = Mathf.max(minVal, Mathf.min(maxVal, this.y));
    this.z = Mathf.max(minVal, Mathf.min(maxVal, this.z));
    this.w = Mathf.max(minVal, Mathf.min(maxVal, this.w));

    return this;
  }

  clampLength(min: f32, max: f32): Vector4 {
    const length = this.length();

    return this.divideScalar(length || 1).multiplyScalar(
      Mathf.max(min, Mathf.min(max, length))
    );
  }

  floor(): Vector4 {
    this.x = Mathf.floor(this.x);
    this.y = Mathf.floor(this.y);
    this.z = Mathf.floor(this.z);
    this.w = Mathf.floor(this.w);

    return this;
  }

  ceil(): Vector4 {
    this.x = Mathf.ceil(this.x);
    this.y = Mathf.ceil(this.y);
    this.z = Mathf.ceil(this.z);
    this.w = Mathf.ceil(this.w);

    return this;
  }

  round(): Vector4 {
    this.x = Mathf.round(this.x);
    this.y = Mathf.round(this.y);
    this.z = Mathf.round(this.z);
    this.w = Mathf.round(this.w);

    return this;
  }

  roundToZero(): Vector4 {
    this.x = this.x < 0 ? Mathf.ceil(this.x) : Mathf.floor(this.x);
    this.y = this.y < 0 ? Mathf.ceil(this.y) : Mathf.floor(this.y);
    this.z = this.z < 0 ? Mathf.ceil(this.z) : Mathf.floor(this.z);
    this.w = this.w < 0 ? Mathf.ceil(this.w) : Mathf.floor(this.w);

    return this;
  }

  negate(): Vector4 {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    this.w = -this.w;

    return this;
  }

  dot(v: Vector4): f32 {
    return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
  }

  lengthSq(): f32 {
    return (
      this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w
    );
  }

  length(): f32 {
    return Mathf.sqrt(
      this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w
    );
  }

  manhattanLength(): f32 {
    return (
      Mathf.abs(this.x) +
      Mathf.abs(this.y) +
      Mathf.abs(this.z) +
      Mathf.abs(this.w)
    );
  }

  normalize(): Vector4 {
    return this.divideScalar(this.length() || 1);
  }

  setLength(length: f32): Vector4 {
    return this.normalize().multiplyScalar(length);
  }

  lerp(v: Vector4, alpha: f32): Vector4 {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    this.w += (v.w - this.w) * alpha;

    return this;
  }

  lerpVectors(v1: Vector4, v2: Vector4, alpha: f32): Vector4 {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    this.z = v1.z + (v2.z - v1.z) * alpha;
    this.w = v1.w + (v2.w - v1.w) * alpha;

    return this;
  }

  equals(v: Vector4): boolean {
    return v.x === this.x && v.y === this.y && v.z === this.z && v.w === this.w;
  }

  fromArray(array: f32[], offset: u32 = 0): Vector4 {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    this.w = array[offset + 3];

    return this;
  }

  toArray(array: f32[] = [], offset: u32 = 0): f32[] {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    array[offset + 3] = this.w;

    return array;
  }

  random(): Vector4 {
    this.x = Mathf.random();
    this.y = Mathf.random();
    this.z = Mathf.random();
    this.w = Mathf.random();

    return this;
  }
}
