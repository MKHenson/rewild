import { Euler, EulerRotationOrder } from "./Euler";
import * as MathUtils from "./MathUtils";
import { Matrix4 } from "./Matrix4";
import { Vector3 } from "./Vector3";
import { Object } from "../core/Object";

export class Quaternion {
  _x: f32;
  _y: f32;
  _z: f32;
  _w: f32;

  isQuaternion: boolean = true;
  _onChangeCallback: Object | null;

  constructor(x: f32 = 0, y: f32 = 0, z: f32 = 0, w: f32 = 1) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
    this._onChangeCallback = null;
  }

  static slerp(qa: Quaternion, qb: Quaternion, qm: Quaternion, t: f32): void {
    return qm.slerpQuaternions(qa, qb, t);
  }

  static slerpFlat(
    dst: f32[],
    dstOffset: u32,
    src0: f32[],
    srcOffset0: u32,
    src1: f32[],
    srcOffset1: u32,
    t: f32
  ): void {
    // fuzz-free, array-based Quaternion SLERP operation

    let x0 = src0[srcOffset0 + 0],
      y0 = src0[srcOffset0 + 1],
      z0 = src0[srcOffset0 + 2],
      w0 = src0[srcOffset0 + 3];

    const x1 = src1[srcOffset1 + 0],
      y1 = src1[srcOffset1 + 1],
      z1 = src1[srcOffset1 + 2],
      w1 = src1[srcOffset1 + 3];

    if (t === 0) {
      dst[dstOffset + 0] = x0;
      dst[dstOffset + 1] = y0;
      dst[dstOffset + 2] = z0;
      dst[dstOffset + 3] = w0;
      return;
    }

    if (t === 1) {
      dst[dstOffset + 0] = x1;
      dst[dstOffset + 1] = y1;
      dst[dstOffset + 2] = z1;
      dst[dstOffset + 3] = w1;
      return;
    }

    if (w0 !== w1 || x0 !== x1 || y0 !== y1 || z0 !== z1) {
      let s = 1 - t;
      const cos = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1,
        dir = cos >= 0 ? 1 : -1,
        sqrSin = 1 - cos * cos;

      // Skip the Slerp for tiny steps to avoid numeric problems:
      if (sqrSin > f32.EPSILON) {
        const sin = Mathf.sqrt(sqrSin),
          len = Mathf.atan2(sin, cos * dir);

        s = Mathf.sin(s * len) / sin;
        t = Mathf.sin(t * len) / sin;
      }

      const tDir = t * dir;

      x0 = x0 * s + x1 * tDir;
      y0 = y0 * s + y1 * tDir;
      z0 = z0 * s + z1 * tDir;
      w0 = w0 * s + w1 * tDir;

      // Normalize in case we just did a lerp:
      if (s === 1 - t) {
        const f = 1 / Mathf.sqrt(x0 * x0 + y0 * y0 + z0 * z0 + w0 * w0);

        x0 *= f;
        y0 *= f;
        z0 *= f;
        w0 *= f;
      }
    }

    dst[dstOffset] = x0;
    dst[dstOffset + 1] = y0;
    dst[dstOffset + 2] = z0;
    dst[dstOffset + 3] = w0;
  }

  static multiplyQuaternionsFlat(
    dst: f32[],
    dstOffset: u32,
    src0: f32[],
    srcOffset0: u32,
    src1: f32[],
    srcOffset1: u32
  ): f32[] {
    const x0 = src0[srcOffset0];
    const y0 = src0[srcOffset0 + 1];
    const z0 = src0[srcOffset0 + 2];
    const w0 = src0[srcOffset0 + 3];

    const x1 = src1[srcOffset1];
    const y1 = src1[srcOffset1 + 1];
    const z1 = src1[srcOffset1 + 2];
    const w1 = src1[srcOffset1 + 3];

    dst[dstOffset] = x0 * w1 + w0 * x1 + y0 * z1 - z0 * y1;
    dst[dstOffset + 1] = y0 * w1 + w0 * y1 + z0 * x1 - x0 * z1;
    dst[dstOffset + 2] = z0 * w1 + w0 * z1 + x0 * y1 - y0 * x1;
    dst[dstOffset + 3] = w0 * w1 - x0 * x1 - y0 * y1 - z0 * z1;

    return dst;
  }

  get x(): f32 {
    return this._x;
  }

  set x(value: f32) {
    this._x = value;
    this.onChangeCallback();
  }

  get y(): f32 {
    return this._y;
  }

  set y(value: f32) {
    this._y = value;
    this.onChangeCallback();
  }

  get z(): f32 {
    return this._z;
  }

  set z(value: f32) {
    this._z = value;
    this.onChangeCallback();
  }

  get w(): f32 {
    return this._w;
  }

  set w(value: f32) {
    this._w = value;
    this.onChangeCallback();
  }

  set(x: f32, y: f32, z: f32, w: f32): Quaternion {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;

    this.onChangeCallback();

    return this;
  }

  clone(): Quaternion {
    return new Quaternion(this._x, this._y, this._z, this._w);
  }

  copy(quaternion: Quaternion): Quaternion {
    this._x = quaternion.x;
    this._y = quaternion.y;
    this._z = quaternion.z;
    this._w = quaternion.w;

    this.onChangeCallback();

    return this;
  }

  setFromEuler(euler: Euler, update: boolean): Quaternion {
    const x = euler._x,
      y = euler._y,
      z = euler._z,
      order = euler._order;

    // http://www.mathworks.com/matlabcentral/fileexchange/
    // 	20696-function-to-convert-between-dcm-euler-angles-quaternions-and-euler-vectors/
    //	content/SpinCalc.m

    const cos = Mathf.cos;
    const sin = Mathf.sin;

    const c1 = cos(x / 2);
    const c2 = cos(y / 2);
    const c3 = cos(z / 2);

    const s1 = sin(x / 2);
    const s2 = sin(y / 2);
    const s3 = sin(z / 2);

    switch (order) {
      case EulerRotationOrder.XYZ:
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;

      case EulerRotationOrder.YXZ:
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;

      case EulerRotationOrder.ZXY:
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;

      case EulerRotationOrder.ZYX:
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;

      case EulerRotationOrder.YZX:
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;

      case EulerRotationOrder.XZY:
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;

      default:
        throw new Error("Quaternion: .setFromEuler() encountered an unknown order");
    }

    if (update !== false) this.onChangeCallback();

    return this;
  }

  setFromAxisAngle(axis: Vector3, angle: f32): Quaternion {
    // http://www.euclideanspace.com/maths/geometry/rotations/conversions/angleToQuaternion/index.htm

    // assumes axis is normalized

    const halfAngle: f32 = angle / 2,
      s: f32 = Mathf.sin(halfAngle);

    this._x = axis.x * s;
    this._y = axis.y * s;
    this._z = axis.z * s;
    this._w = Mathf.cos(halfAngle);

    this.onChangeCallback();

    return this;
  }

  setFromRotationMatrix(m: Matrix4): Quaternion {
    // http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToQuaternion/index.htm

    // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

    const te = m.elements,
      m11: f32 = te[0],
      m12: f32 = te[4],
      m13: f32 = te[8],
      m21: f32 = te[1],
      m22: f32 = te[5],
      m23: f32 = te[9],
      m31: f32 = te[2],
      m32: f32 = te[6],
      m33: f32 = te[10],
      trace: f32 = m11 + m22 + m33;

    if (trace > 0) {
      const s: f32 = 0.5 / Mathf.sqrt(trace + 1.0);

      this._w = 0.25 / s;
      this._x = (m32 - m23) * s;
      this._y = (m13 - m31) * s;
      this._z = (m21 - m12) * s;
    } else if (m11 > m22 && m11 > m33) {
      const s: f32 = 2.0 * Mathf.sqrt(1.0 + m11 - m22 - m33);

      this._w = (m32 - m23) / s;
      this._x = 0.25 * s;
      this._y = (m12 + m21) / s;
      this._z = (m13 + m31) / s;
    } else if (m22 > m33) {
      const s: f32 = 2.0 * Mathf.sqrt(1.0 + m22 - m11 - m33);

      this._w = (m13 - m31) / s;
      this._x = (m12 + m21) / s;
      this._y = 0.25 * s;
      this._z = (m23 + m32) / s;
    } else {
      const s: f32 = 2.0 * Mathf.sqrt(1.0 + m33 - m11 - m22);

      this._w = (m21 - m12) / s;
      this._x = (m13 + m31) / s;
      this._y = (m23 + m32) / s;
      this._z = 0.25 * s;
    }

    this.onChangeCallback();
    return this;
  }

  setFromUnitVectors(vFrom: Vector3, vTo: Vector3): Quaternion {
    // assumes direction vectors vFrom and vTo are normalized

    let r = vFrom.dot(vTo) + 1;

    if (r < f32.EPSILON) {
      // vFrom and vTo point in opposite directions

      r = 0;

      if (Mathf.abs(vFrom.x) > Mathf.abs(vFrom.z)) {
        this._x = -vFrom.y;
        this._y = vFrom.x;
        this._z = 0;
        this._w = r;
      } else {
        this._x = 0;
        this._y = -vFrom.z;
        this._z = vFrom.y;
        this._w = r;
      }
    } else {
      // crossVectors( vFrom, vTo ); // inlined to avoid cyclic dependency on Vector3

      this._x = vFrom.y * vTo.z - vFrom.z * vTo.y;
      this._y = vFrom.z * vTo.x - vFrom.x * vTo.z;
      this._z = vFrom.x * vTo.y - vFrom.y * vTo.x;
      this._w = r;
    }

    return this.normalize();
  }

  angleTo(q: Quaternion): f32 {
    return 2 * Mathf.acos(Mathf.abs(MathUtils.clamp(this.dot(q), -1, 1)));
  }

  rotateTowards(q: Quaternion, step: f32): Quaternion {
    const angle = this.angleTo(q);

    if (angle === 0) return this;

    const t = Mathf.min(1, step / angle);

    this.slerp(q, t);

    return this;
  }

  identity(): Quaternion {
    return this.set(0, 0, 0, 1);
  }

  invert(): Quaternion {
    // quaternion is assumed to have unit length

    return this.conjugate();
  }

  conjugate(): Quaternion {
    this._x *= -1;
    this._y *= -1;
    this._z *= -1;

    this.onChangeCallback();

    return this;
  }

  dot(v: Quaternion): f32 {
    return this._x * v._x + this._y * v._y + this._z * v._z + this._w * v._w;
  }

  lengthSq(): f32 {
    return this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w;
  }

  length(): f32 {
    return Mathf.sqrt(this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w);
  }

  normalize(): Quaternion {
    let l = this.length();

    if (l === 0) {
      this._x = 0;
      this._y = 0;
      this._z = 0;
      this._w = 1;
    } else {
      l = 1 / l;

      this._x = this._x * l;
      this._y = this._y * l;
      this._z = this._z * l;
      this._w = this._w * l;
    }

    this.onChangeCallback();

    return this;
  }

  multiply(q: Quaternion): Quaternion {
    return this.multiplyQuaternions(this, q);
  }

  premultiply(q: Quaternion): Quaternion {
    return this.multiplyQuaternions(q, this);
  }

  multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
    // from http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/code/index.htm

    const qax = a._x,
      qay = a._y,
      qaz = a._z,
      qaw = a._w;
    const qbx = b._x,
      qby = b._y,
      qbz = b._z,
      qbw = b._w;

    this._x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    this._y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    this._z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    this._w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;

    this.onChangeCallback();

    return this;
  }

  slerp(qb: Quaternion, t: f32): Quaternion {
    if (t === 0) return this;
    if (t === 1) return this.copy(qb);

    const x = this._x,
      y = this._y,
      z = this._z,
      w = this._w;

    // http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/slerp/

    let cosHalfTheta = w * qb._w + x * qb._x + y * qb._y + z * qb._z;

    if (cosHalfTheta < 0) {
      this._w = -qb._w;
      this._x = -qb._x;
      this._y = -qb._y;
      this._z = -qb._z;

      cosHalfTheta = -cosHalfTheta;
    } else {
      this.copy(qb);
    }

    if (cosHalfTheta >= 1.0) {
      this._w = w;
      this._x = x;
      this._y = y;
      this._z = z;

      return this;
    }

    const sqrSinHalfTheta = 1.0 - cosHalfTheta * cosHalfTheta;

    if (sqrSinHalfTheta <= f32.EPSILON) {
      const s = 1 - t;
      this._w = s * w + t * this._w;
      this._x = s * x + t * this._x;
      this._y = s * y + t * this._y;
      this._z = s * z + t * this._z;

      this.normalize();
      this.onChangeCallback();

      return this;
    }

    const sinHalfTheta = Mathf.sqrt(sqrSinHalfTheta);
    const halfTheta = Mathf.atan2(sinHalfTheta, cosHalfTheta);
    const ratioA = Mathf.sin((1 - t) * halfTheta) / sinHalfTheta,
      ratioB = Mathf.sin(t * halfTheta) / sinHalfTheta;

    this._w = w * ratioA + this._w * ratioB;
    this._x = x * ratioA + this._x * ratioB;
    this._y = y * ratioA + this._y * ratioB;
    this._z = z * ratioA + this._z * ratioB;

    this.onChangeCallback();

    return this;
  }

  slerpQuaternions(qa: Quaternion, qb: Quaternion, t: f32): void {
    this.copy(qa).slerp(qb, t);
  }

  equals(quaternion: Quaternion): boolean {
    return (
      quaternion._x === this._x && quaternion._y === this._y && quaternion._z === this._z && quaternion._w === this._w
    );
  }

  fromArray(array: f32[], offset: u32 = 0): Quaternion {
    this._x = array[offset];
    this._y = array[offset + 1];
    this._z = array[offset + 2];
    this._w = array[offset + 3];

    this.onChangeCallback();

    return this;
  }

  toArray(array: f32[] = [], offset: u32 = 0): f32[] {
    array[offset] = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._w;

    return array;
  }

  // TODO:
  //   fromBufferAttribute(attribute, index) {
  //     this._x = attribute.getX(index);
  //     this._y = attribute.getY(index);
  //     this._z = attribute.getZ(index);
  //     this._w = attribute.getW(index);

  //     return this;
  //   }

  private onChangeCallback(): void {
    if (this._onChangeCallback) this._onChangeCallback!.onQuatChanged(this);
  }

  _onChange(callback: Object): Quaternion {
    this._onChangeCallback = callback;

    return this;
  }
}
