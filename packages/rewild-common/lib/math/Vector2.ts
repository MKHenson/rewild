import { IVector } from './IVector';
import { Matrix3 } from './Matrix3';
import { Vector3 } from './Vector3';
import { Vector4 } from './Vector4';

export class Vector2 implements IVector {
  isVector2: boolean = true;
  x: f32;
  y: f32;

  constructor(x: f32 = 0, y: f32 = 0) {
    this.x = x;
    this.y = y;
  }

  get width(): f32 {
    return this.x;
  }

  set width(value: f32) {
    this.x = value;
  }

  get height(): f32 {
    return this.y;
  }

  set height(value: f32) {
    this.y = value;
  }

  set(x: f32, y: f32): Vector2 {
    this.x = x;
    this.y = y;

    return this;
  }

  setScalar(scalar: f32): Vector2 {
    this.x = scalar;
    this.y = scalar;

    return this;
  }

  setX(x: f32): Vector2 {
    this.x = x;

    return this;
  }

  setY(y: f32): Vector2 {
    this.y = y;

    return this;
  }

  setComponent(index: u32, value: f32): Vector2 {
    switch (index) {
      case 0:
        this.x = value;
        break;
      case 1:
        this.y = value;
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
      default:
        throw new Error('index is out of range: ' + index);
    }
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  copy(v: Vector2): Vector2 {
    this.x = v.x;
    this.y = v.y;

    return this;
  }

  add(v: Vector2): Vector2 {
    this.x += v.x;
    this.y += v.y;

    return this;
  }

  addScalar(s: f32): Vector2 {
    this.x += s;
    this.y += s;

    return this;
  }

  addVectors(a: Vector2, b: Vector2): Vector2 {
    this.x = a.x + b.x;
    this.y = a.y + b.y;

    return this;
  }

  addScaledVector(v: IVector, s: f32): Vector2 {
    if (v instanceof Vector2) {
      const vec2 = v as Vector2;
      this.x += vec2.x * s;
      this.y += vec2.y * s;
    } else if (v instanceof Vector3) {
      const vec3 = v as Vector3;
      this.x += vec3.x * s;
      this.y += vec3.y * s;
    } else if (v instanceof Vector4) {
      const vec4 = v as Vector4;
      this.x += vec4.x * s;
      this.y += vec4.y * s;
    }

    return this;
  }

  sub(v: Vector2): Vector2 {
    this.x -= v.x;
    this.y -= v.y;

    return this;
  }

  subScalar(s: f32): Vector2 {
    this.x -= s;
    this.y -= s;

    return this;
  }

  subVectors(a: Vector2, b: Vector2): Vector2 {
    this.x = a.x - b.x;
    this.y = a.y - b.y;

    return this;
  }

  multiply(v: Vector2): Vector2 {
    this.x *= v.x;
    this.y *= v.y;

    return this;
  }

  multiplyScalar(scalar: f32): Vector2 {
    this.x *= scalar;
    this.y *= scalar;

    return this;
  }

  divide(v: Vector2): Vector2 {
    this.x /= v.x;
    this.y /= v.y;

    return this;
  }

  divideScalar(scalar: f32): Vector2 {
    return this.multiplyScalar(1 / scalar);
  }

  applyMatrix3(m: Matrix3): Vector2 {
    const x = this.x,
      y = this.y;
    const e = m.elements;

    this.x = e[0] * x + e[3] * y + e[6];
    this.y = e[1] * x + e[4] * y + e[7];

    return this;
  }

  min(v: Vector2): Vector2 {
    this.x = Mathf.min(this.x, v.x);
    this.y = Mathf.min(this.y, v.y);

    return this;
  }

  max(v: Vector2): Vector2 {
    this.x = Mathf.max(this.x, v.x);
    this.y = Mathf.max(this.y, v.y);

    return this;
  }

  clamp(min: Vector2, max: Vector2): Vector2 {
    // assumes min < max, componentwise

    this.x = Mathf.max(min.x, Mathf.min(max.x, this.x));
    this.y = Mathf.max(min.y, Mathf.min(max.y, this.y));

    return this;
  }

  clampScalar(minVal: f32, maxVal: f32): Vector2 {
    this.x = Mathf.max(minVal, Mathf.min(maxVal, this.x));
    this.y = Mathf.max(minVal, Mathf.min(maxVal, this.y));

    return this;
  }

  clampLength(min: f32, max: f32): Vector2 {
    const length = this.length();

    return this.divideScalar(length || 1).multiplyScalar(
      Mathf.max(min, Mathf.min(max, length))
    );
  }

  floor(): Vector2 {
    this.x = Mathf.floor(this.x);
    this.y = Mathf.floor(this.y);

    return this;
  }

  ceil(): Vector2 {
    this.x = Mathf.ceil(this.x);
    this.y = Mathf.ceil(this.y);

    return this;
  }

  round(): Vector2 {
    this.x = Mathf.round(this.x);
    this.y = Mathf.round(this.y);

    return this;
  }

  roundToZero(): Vector2 {
    this.x = this.x < 0 ? Mathf.ceil(this.x) : Mathf.floor(this.x);
    this.y = this.y < 0 ? Mathf.ceil(this.y) : Mathf.floor(this.y);

    return this;
  }

  negate(): Vector2 {
    this.x = -this.x;
    this.y = -this.y;

    return this;
  }

  dot(v: Vector2): f32 {
    return this.x * v.x + this.y * v.y;
  }

  cross(v: Vector2): f32 {
    return this.x * v.y - this.y * v.x;
  }

  lengthSq(): f32 {
    return this.x * this.x + this.y * this.y;
  }

  length(): f32 {
    return Mathf.sqrt(this.x * this.x + this.y * this.y);
  }

  manhattanLength(): f32 {
    return Mathf.abs(this.x) + Mathf.abs(this.y);
  }

  normalize(): Vector2 {
    return this.divideScalar(this.length() || 1);
  }

  angle(): f32 {
    // computes the angle in radians with respect to the positive x-axis
    const angle = Mathf.atan2(-this.y, -this.x) + Mathf.PI;
    return angle;
  }

  distanceTo(v: Vector2): f32 {
    return Mathf.sqrt(this.distanceToSquared(v));
  }

  distanceToSquared(v: Vector2): f32 {
    const dx = this.x - v.x,
      dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  manhattanDistanceTo(v: Vector2): f32 {
    return Mathf.abs(this.x - v.x) + Mathf.abs(this.y - v.y);
  }

  setLength(length: f32): Vector2 {
    return this.normalize().multiplyScalar(length);
  }

  lerp(v: Vector2, alpha: f32): Vector2 {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;

    return this;
  }

  lerpVectors(v1: Vector2, v2: Vector2, alpha: f32): Vector2 {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;

    return this;
  }

  equals(v: Vector2): boolean {
    return v.x === this.x && v.y === this.y;
  }

  fromArray(array: Float32Array, offset: u32 = 0): Vector2 {
    this.x = array[offset];
    this.y = array[offset + 1];

    return this;
  }

  toArray(array: f32[] = [], offset: u32 = 0): f32[] {
    array[offset] = this.x;
    array[offset + 1] = this.y;

    return array;
  }

  rotateAround(center: Vector2, angle: f32): Vector2 {
    const c = Mathf.cos(angle),
      s = Mathf.sin(angle);

    const x = this.x - center.x;
    const y = this.y - center.y;

    this.x = x * c - y * s + center.x;
    this.y = x * s + y * c + center.y;

    return this;
  }

  random(): Vector2 {
    this.x = Mathf.random();
    this.y = Mathf.random();

    return this;
  }
}
