/**
 * @author MathewKHenson
 * @author schteppe
 */

import { Cylindrical } from "./Cylindrical";
import { Euler } from "./Euler";
import * as MathUtils from "./MathUtils";
import { Matrix3 } from "./Matrix3";
import { Matrix4 } from "./Matrix4";
import { Quaternion } from "./Quaternion";
import { Spherical } from "./Spherical";

export class Vector3 {
  static ZERO: Vector3 = new Vector3(0, 0, 0);
  static UNITX: Vector3 = new Vector3(1, 0, 0);
  static UNITY: Vector3 = new Vector3(0, 1, 0);
  static UNITZ: Vector3 = new Vector3(0, 0, 1);

  isVector3: boolean = true;
  x: f32;
  y: f32;
  z: f32;

  constructor(x: f32 = 0, y: f32 = 0, z: f32 = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x: f32, y: f32, z: f32): Vector3 {
    this.x = x;
    this.y = y;
    this.z = z;

    return this;
  }

  setByIndex(index: u8, value: f32): Vector3 {
    if (index === 0) this.x = value;
    else if (index === 1) this.y = value;
    else this.z = value;

    return this;
  }

  setScalar(scalar: f32): Vector3 {
    this.x = scalar;
    this.y = scalar;
    this.z = scalar;

    return this;
  }

  setX(x: f32): Vector3 {
    this.x = x;

    return this;
  }

  setY(y: f32): Vector3 {
    this.y = y;

    return this;
  }

  setZ(z: f32): Vector3 {
    this.z = z;

    return this;
  }

  setComponent(index: u32, value: f32): Vector3 {
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
      default:
        throw new Error(`index is out of range: ${index}`);
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
      default:
        throw new Error(`index is out of range: ${index}`);
    }
  }

  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  copy(v: Vector3): Vector3 {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;

    return this;
  }

  add(v: Vector3): Vector3 {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;

    return this;
  }

  addScalar(s: f32): Vector3 {
    this.x += s;
    this.y += s;
    this.z += s;

    return this;
  }

  addVectors(a: Vector3, b: Vector3): Vector3 {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;

    return this;
  }

  addScaledVector(v: Vector3, s: f32): Vector3 {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;

    return this;
  }

  sub(v: Vector3): Vector3 {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;

    return this;
  }

  subScalar(s: f32): Vector3 {
    this.x -= s;
    this.y -= s;
    this.z -= s;

    return this;
  }

  subVectors(a: Vector3, b: Vector3): Vector3 {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;

    return this;
  }

  multiply(v: Vector3): Vector3 {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;

    return this;
  }

  @inline
  multiplyScalar(scalar: f32): Vector3 {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;

    return this;
  }

  multiplyVectors(a: Vector3, b: Vector3): Vector3 {
    this.x = a.x * b.x;
    this.y = a.y * b.y;
    this.z = a.z * b.z;

    return this;
  }

  applyEuler(euler: Euler): Vector3 {
    return this.applyQuaternion(_quaternion.setFromEuler(euler, false));
  }

  applyAxisAngle(axis: Vector3, angle: f32): Vector3 {
    return this.applyQuaternion(_quaternion.setFromAxisAngle(axis, angle));
  }

  /**
   * Get the cross product matrix a_cross from a vector, such that a x b = a_cross * b = c
   * @method crossmat
   * @see http://www8.cs.umu.se/kurser/TDBD24/VT06/lectures/Lecture6.pdf
   */
  @inline
  crossmat(): Matrix3 {
    return new Matrix3().set(0, -this.z, this.y, this.z, 0, -this.x, -this.y, this.x, 0);
  }

  applyMatrix3(m: Matrix3): Vector3 {
    const x = this.x,
      y = this.y,
      z = this.z;
    const e = m.elements;

    this.x = e[0] * x + e[3] * y + e[6] * z;
    this.y = e[1] * x + e[4] * y + e[7] * z;
    this.z = e[2] * x + e[5] * y + e[8] * z;

    return this;
  }

  applyNormalMatrix(m: Matrix3): Vector3 {
    return this.applyMatrix3(m).normalize();
  }

  applyMatrix4(m: Matrix4): Vector3 {
    const x: f32 = this.x,
      y: f32 = this.y,
      z: f32 = this.z;
    const e = m.elements;

    const w: f32 = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);

    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;

    return this;
  }

  applyQuaternion(q: Quaternion): Vector3 {
    const x = this.x,
      y = this.y,
      z = this.z;
    const qx = q.x,
      qy = q.y,
      qz = q.z,
      qw = q.w;

    // calculate quat * vector

    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;

    // calculate result * inverse quat

    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;

    return this;
  }

  transformDirection(m: Matrix4): Vector3 {
    // input: THREE.Matrix4 affine matrix
    // vector interpreted as a direction

    const x = this.x,
      y = this.y,
      z = this.z;
    const e = m.elements;

    this.x = e[0] * x + e[4] * y + e[8] * z;
    this.y = e[1] * x + e[5] * y + e[9] * z;
    this.z = e[2] * x + e[6] * y + e[10] * z;

    return this.normalize();
  }

  divide(v: Vector3): Vector3 {
    this.x /= v.x;
    this.y /= v.y;
    this.z /= v.z;

    return this;
  }

  @inline
  divideScalar(scalar: f32): Vector3 {
    return this.multiplyScalar(1 / scalar);
  }

  min(v: Vector3): Vector3 {
    this.x = Mathf.min(this.x, v.x);
    this.y = Mathf.min(this.y, v.y);
    this.z = Mathf.min(this.z, v.z);

    return this;
  }

  max(v: Vector3): Vector3 {
    this.x = Mathf.max(this.x, v.x);
    this.y = Mathf.max(this.y, v.y);
    this.z = Mathf.max(this.z, v.z);

    return this;
  }

  clamp(min: Vector3, max: Vector3): Vector3 {
    // assumes min < max, componentwise

    this.x = Mathf.max(min.x, Mathf.min(max.x, this.x));
    this.y = Mathf.max(min.y, Mathf.min(max.y, this.y));
    this.z = Mathf.max(min.z, Mathf.min(max.z, this.z));

    return this;
  }

  clampScalar(minVal: f32, maxVal: f32): Vector3 {
    this.x = Mathf.max(minVal, Mathf.min(maxVal, this.x));
    this.y = Mathf.max(minVal, Mathf.min(maxVal, this.y));
    this.z = Mathf.max(minVal, Mathf.min(maxVal, this.z));

    return this;
  }

  clampLength(min: f32, max: f32): Vector3 {
    const length = this.length();

    return this.divideScalar(length || 1).multiplyScalar(Mathf.max(min, Mathf.min(max, length)));
  }

  floor(): Vector3 {
    this.x = Mathf.floor(this.x);
    this.y = Mathf.floor(this.y);
    this.z = Mathf.floor(this.z);

    return this;
  }

  ceil(): Vector3 {
    this.x = Mathf.ceil(this.x);
    this.y = Mathf.ceil(this.y);
    this.z = Mathf.ceil(this.z);

    return this;
  }

  round(): Vector3 {
    this.x = Mathf.round(this.x);
    this.y = Mathf.round(this.y);
    this.z = Mathf.round(this.z);

    return this;
  }

  roundToZero(): Vector3 {
    this.x = this.x < 0 ? Mathf.ceil(this.x) : Mathf.floor(this.x);
    this.y = this.y < 0 ? Mathf.ceil(this.y) : Mathf.floor(this.y);
    this.z = this.z < 0 ? Mathf.ceil(this.z) : Mathf.floor(this.z);

    return this;
  }

  negate(): Vector3 {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;

    return this;
  }

  /**
   * Compute two artificial tangents to the vector
   * @method tangents
   * @param {Vec3} t1 Vector object to save the first tangent in
   * @param {Vec3} t2 Vector object to save the second tangent in
   */

  tangents(t1: Vector3, t2: Vector3) {
    var norm = this.length();

    if (norm > 0.0) {
      var n = Vec3_tangents_n;
      var inorm = 1 / norm;
      n.set(this.x * inorm, this.y * inorm, this.z * inorm);
      var randVec = Vec3_tangents_randVec;
      if (Math.abs(n.x) < 0.9) {
        randVec.set(1, 0, 0);
        // n.cross(randVec, t1);
        t1.crossVectors(n, randVec);
      } else {
        randVec.set(0, 1, 0);
        // n.cross(randVec, t1);
        t1.crossVectors(n, randVec);
      }
      // n.cross(t1, t2);
      t2.crossVectors(n, t1);
    } else {
      // The normal length is zero, make something up
      t1.set(1, 0, 0);
      t2.set(0, 1, 0);
    }
  }

  @inline
  dot(v: Vector3): f32 {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  /**
   * Get the squared length of the vector
   */
  norm2() {
    return this.dot(this);
  }

  @inline
  isZero(): boolean {
    return this.x == 0 && this.y == 0 && this.z == 0;
  }

  // TODO lengthSquared?
  @inline
  lengthSq(): f32 {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  @inline
  length(): f32 {
    return Mathf.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  @inline
  manhattanLength(): f32 {
    return Mathf.abs(this.x) + Mathf.abs(this.y) + Mathf.abs(this.z);
  }

  @inline
  normalize(): Vector3 {
    return this.divideScalar(this.length() || 1);
  }

  /**
   * Get the version of this vector that is of length 1.
   * @method unit
   * @param {Vec3} target Optional target to save in
   */
  unit(target: Vector3 | null): Vector3 {
    target = target || new Vector3();
    var x = this.x,
      y = this.y,
      z = this.z;
    var ninv = Mathf.sqrt(x * x + y * y + z * z);
    if (ninv > 0.0) {
      ninv = 1.0 / ninv;
      target.x = x * ninv;
      target.y = y * ninv;
      target.z = z * ninv;
    } else {
      target.x = 1;
      target.y = 0;
      target.z = 0;
    }
    return target;
  }

  @inline
  setLength(length: f32): Vector3 {
    return this.normalize().multiplyScalar(length);
  }

  lerp(v: Vector3, alpha: f32): Vector3 {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;

    return this;
  }

  lerpVectors(v1: Vector3, v2: Vector3, alpha: f32): Vector3 {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    this.z = v1.z + (v2.z - v1.z) * alpha;

    return this;
  }

  @inline
  cross(v: Vector3): Vector3 {
    return this.crossVectors(this, v);
  }

  crossVectors(a: Vector3, b: Vector3): Vector3 {
    const ax = a.x,
      ay = a.y,
      az = a.z;
    const bx = b.x,
      by = b.y,
      bz = b.z;

    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;

    return this;
  }

  @inline
  setZero() {
    this.x = this.y = this.z = 0;
  }

  projectOnVector(v: Vector3): Vector3 {
    const denominator = v.lengthSq();

    if (denominator === 0) return this.set(0, 0, 0);

    const scalar = v.dot(this) / denominator;

    return this.copy(v).multiplyScalar(scalar);
  }

  projectOnPlane(planeNormal: Vector3): Vector3 {
    _vector.copy(this).projectOnVector(planeNormal);

    return this.sub(_vector);
  }

  reflect(normal: Vector3): Vector3 {
    // reflect incident vector off plane orthogonal to normal
    // normal is assumed to have unit length

    return this.sub(_vector.copy(normal).multiplyScalar(2 * this.dot(normal)));
  }

  angleTo(v: Vector3): f32 {
    const denominator = Mathf.sqrt(this.lengthSq() * v.lengthSq());

    if (denominator === 0) return Mathf.PI / 2;

    const theta = this.dot(v) / denominator;

    // clamp, to handle numerical problems

    return Mathf.acos(MathUtils.clamp(theta, -1, 1));
  }

  @inline
  distanceTo(v: Vector3): f32 {
    return Mathf.sqrt(this.distanceToSquared(v));
  }

  distanceToSquared(v: Vector3): f32 {
    const dx = this.x - v.x,
      dy = this.y - v.y,
      dz = this.z - v.z;

    return dx * dx + dy * dy + dz * dz;
  }

  manhattanDistanceTo(v: Vector3): f32 {
    return Mathf.abs(this.x - v.x) + Mathf.abs(this.y - v.y) + Mathf.abs(this.z - v.z);
  }

  @inline
  setFromSpherical(s: Spherical): Vector3 {
    return this.setFromSphericalCoords(s.radius, s.phi, s.theta);
  }

  setFromSphericalCoords(radius: f32, phi: f32, theta: f32): Vector3 {
    const sinPhiRadius = Mathf.sin(phi) * radius;

    this.x = sinPhiRadius * Mathf.sin(theta);
    this.y = Mathf.cos(phi) * radius;
    this.z = sinPhiRadius * Mathf.cos(theta);

    return this;
  }

  setFromCylindrical(c: Cylindrical): Vector3 {
    return this.setFromCylindricalCoords(c.radius, c.theta, c.y);
  }

  setFromCylindricalCoords(radius: f32, theta: f32, y: f32): Vector3 {
    this.x = radius * Mathf.sin(theta);
    this.y = y;
    this.z = radius * Mathf.cos(theta);

    return this;
  }

  setFromMatrixPosition(m: Matrix4): Vector3 {
    const e = m.elements;

    this.x = e[12];
    this.y = e[13];
    this.z = e[14];

    return this;
  }

  setFromMatrixScale(m: Matrix4): Vector3 {
    const sx = this.setFromMatrixColumn(m, 0).length();
    const sy = this.setFromMatrixColumn(m, 1).length();
    const sz = this.setFromMatrixColumn(m, 2).length();

    this.x = sx;
    this.y = sy;
    this.z = sz;

    return this;
  }

  @inline
  setFromMatrixColumn(m: Matrix4, index: u32): Vector3 {
    return this.fromF32Array(m.elements, index * 4);
  }

  @inline
  setFromMatrix3Column(m: Matrix3, index: u32): Vector3 {
    return this.fromF32Array(m.elements, index * 3);
  }

  equals(v: Vector3): boolean {
    return v.x === this.x && v.y === this.y && v.z === this.z;
  }

  almostEquals(v: Vector3, precision: f32 = 1e-6): boolean {
    if (
      Mathf.abs(this.x - v.x) > precision ||
      Mathf.abs(this.y - v.y) > precision ||
      Mathf.abs(this.z - v.z) > precision
    ) {
      return false;
    }
    return true;
  }

  almostZero(precision = 1e-6): boolean {
    if (Mathf.abs(this.x) > precision || Mathf.abs(this.y) > precision || Mathf.abs(this.z) > precision) {
      return false;
    }
    return true;
  }

  fromArray(array: f32[], offset: u32 = 0): Vector3 {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];

    return this;
  }

  fromF32Array(array: Float32Array, offset: u32 = 0): Vector3 {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];

    return this;
  }

  toArray(array: f32[] = [], offset: u32 = 0): f32[] {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;

    return array;
  }

  /**
   * Check if the vector is anti-parallel to another vector.
   */
  isAntiparallelTo(v: Vector3, precision: f32): boolean {
    antip_neg.copy(v).negate();
    return antip_neg.almostEquals(v, precision);
  }

  random(): Vector3 {
    this.x = Mathf.random();
    this.y = Mathf.random();
    this.z = Mathf.random();

    return this;
  }
}

const _vector = new Vector3();
const _quaternion = new Quaternion();
const Vec3_tangents_n = new Vector3();
const Vec3_tangents_randVec = new Vector3();
const antip_neg = new Vector3();
