import { Mat3 } from './Mat3';

/**
 * 3-dimensional vector
 * @example
 *     const v = new Vec3(1, 2, 3)
 *     console.log('x=' + v.x) // x=1
 */
export class Vec3 {
  x: f32;
  y: f32;
  z: f32;

  static ZERO: Vec3 = new Vec3(0, 0, 0);
  static UNIT_X: Vec3 = new Vec3(1, 0, 0);
  static UNIT_Y: Vec3 = new Vec3(0, 1, 0);
  static UNIT_Z: Vec3 = new Vec3(0, 0, 1);

  constructor(x: f32 = 0.0, y: f32 = 0.0, z: f32 = 0.0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /**
   * Vector cross product
   * @param target Optional target to save in.
   */
  cross(vector: Vec3, target: Vec3 = new Vec3()): Vec3 {
    const vx = vector.x;
    const vy = vector.y;
    const vz = vector.z;
    const x = this.x;
    const y = this.y;
    const z = this.z;

    target.x = y * vz - z * vy;
    target.y = z * vx - x * vz;
    target.z = x * vy - y * vx;

    return target;
  }

  /**
   * Set the vectors' 3 elements
   */
  set(x: f32, y: f32, z: f32): Vec3 {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  /**
   * Set all components of the vector to zero.
   */
  setZero(): void {
    this.x = this.y = this.z = 0;
  }

  /**
   * Vector addition
   */
  vadd(vector: Vec3, target: Vec3 | null = null): Vec3 {
    if (target) {
      target.x = vector.x + this.x;
      target.y = vector.y + this.y;
      target.z = vector.z + this.z;
      return this;
    } else {
      return new Vec3(this.x + vector.x, this.y + vector.y, this.z + vector.z);
    }
  }

  /**
   * Vector subtraction
   * @param target Optional target to save in.
   */
  vsub(vector: Vec3, target: Vec3 | null = null): Vec3 {
    if (target) {
      target.x = this.x - vector.x;
      target.y = this.y - vector.y;
      target.z = this.z - vector.z;
      return this;
    } else {
      return new Vec3(this.x - vector.x, this.y - vector.y, this.z - vector.z);
    }
  }

  /**
   * Get the cross product matrix a_cross from a vector, such that a x b = a_cross * b = c
   *
   * See {@link https://www8.cs.umu.se/kurser/TDBD24/VT06/lectures/Lecture6.pdf Umeå University Lecture}
   */
  crossmat(): Mat3 {
    return new Mat3([
      0,
      -this.z,
      this.y,
      this.z,
      0,
      -this.x,
      -this.y,
      this.x,
      0,
    ]);
  }

  /**
   * Normalize the vector. Note that this changes the values in the vector.

   * @return Returns the norm of the vector
   */
  normalize(): f32 {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const n = Mathf.sqrt(x * x + y * y + z * z);
    if (n > 0.0) {
      const invN: f32 = 1 / n;
      this.x *= invN;
      this.y *= invN;
      this.z *= invN;
    } else {
      // Make something up
      this.x = 0;
      this.y = 0;
      this.z = 0;
    }
    return n;
  }

  /**
   * Get the version of this vector that is of length 1.
   * @param target Optional target to save in
   * @return Returns the unit vector
   */
  unit(target: Vec3 = new Vec3()): Vec3 {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    let ninv: f32 = Mathf.sqrt(x * x + y * y + z * z);
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

  /**
   * Get the length of the vector
   */
  length(): f32 {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    return Mathf.sqrt(x * x + y * y + z * z);
  }

  /**
   * Get the squared length of the vector.
   */
  lengthSquared(): f32 {
    return this.dot(this);
  }

  /**
   * Get distance from this point to another point
   */
  distanceTo(p: Vec3): f32 {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const px = p.x;
    const py = p.y;
    const pz = p.z;
    return Mathf.sqrt(
      (px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z)
    );
  }

  /**
   * Get squared distance from this point to another point
   */
  distanceSquared(p: Vec3): f32 {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const px = p.x;
    const py = p.y;
    const pz = p.z;
    return (px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z);
  }

  /**
   * Multiply all the components of the vector with a scalar.
   * @param target The vector to save the result in.
   */
  scale(scalar: f32, target: Vec3 = new Vec3()): Vec3 {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    target.x = scalar * x;
    target.y = scalar * y;
    target.z = scalar * z;
    return target;
  }

  /**
   * Multiply the vector with an other vector, component-wise.
   * @param target The vector to save the result in.
   */
  vmul(vector: Vec3, target: Vec3 = new Vec3()): Vec3 {
    target.x = vector.x * this.x;
    target.y = vector.y * this.y;
    target.z = vector.z * this.z;
    return target;
  }

  /**
   * Scale a vector and add it to this vector. Save the result in "target". (target = this + vector * scalar)
   * @param target The vector to save the result in.
   */
  addScaledVector(scalar: f32, vector: Vec3, target: Vec3 = new Vec3()): Vec3 {
    target.x = this.x + scalar * vector.x;
    target.y = this.y + scalar * vector.y;
    target.z = this.z + scalar * vector.z;
    return target;
  }

  /**
   * Calculate dot product
   * @param vector
   */
  dot(vector: Vec3): f32 {
    return this.x * vector.x + this.y * vector.y + this.z * vector.z;
  }

  isZero(): boolean {
    return this.x === 0 && this.y === 0 && this.z === 0;
  }

  /**
   * Make the vector point in the opposite direction.
   * @param target Optional target to save in
   */
  negate(target: Vec3 = new Vec3()): Vec3 {
    target.x = -this.x;
    target.y = -this.y;
    target.z = -this.z;
    return target;
  }

  /**
   * Compute two artificial tangents to the vector
   * @param t1 Vector object to save the first tangent in
   * @param t2 Vector object to save the second tangent in
   */
  tangents(t1: Vec3, t2: Vec3): void {
    const norm = this.length();
    if (norm > 0.0) {
      const n = Vec3_tangents_n;
      const inorm: f32 = 1 / norm;
      n.set(this.x * inorm, this.y * inorm, this.z * inorm);
      const randVec = Vec3_tangents_randVec;
      if (Mathf.abs(n.x) < 0.9) {
        randVec.set(1, 0, 0);
        n.cross(randVec, t1);
      } else {
        randVec.set(0, 1, 0);
        n.cross(randVec, t1);
      }
      n.cross(t1, t2);
    } else {
      // The normal length is zero, make something up
      t1.set(1, 0, 0);
      t2.set(0, 1, 0);
    }
  }

  /**
   * Converts to a more readable format
   */
  toString(): string {
    return `${this.x},${this.y},${this.z}`;
  }

  /**
   * Converts to an array
   */
  toArray(): f32[] {
    return [this.x, this.y, this.z];
  }

  /**
   * Copies value of source to this vector.
   */
  copy(vector: Vec3): Vec3 {
    this.x = vector.x;
    this.y = vector.y;
    this.z = vector.z;
    return this;
  }

  /**
   * Do a linear interpolation between two vectors
   * @param t A number between 0 and 1. 0 will make this function return u, and 1 will make it return v. Numbers in between will generate a vector in between them.
   */
  lerp(vector: Vec3, t: f32, target: Vec3): void {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    target.x = x + (vector.x - x) * t;
    target.y = y + (vector.y - y) * t;
    target.z = z + (vector.z - z) * t;
  }

  /**
   * Check if a vector equals is almost equal to another one.
   */
  almostEquals(vector: Vec3, precision: f32 = 1e-6): boolean {
    if (
      Mathf.abs(this.x - vector.x) > precision ||
      Mathf.abs(this.y - vector.y) > precision ||
      Mathf.abs(this.z - vector.z) > precision
    ) {
      return false;
    }
    return true;
  }

  /**
   * Check if a vector is almost zero
   */
  almostZero(precision: f32 = 1e-6): boolean {
    if (
      Mathf.abs(this.x) > precision ||
      Mathf.abs(this.y) > precision ||
      Mathf.abs(this.z) > precision
    ) {
      return false;
    }
    return true;
  }

  /**
   * Check if the vector is anti-parallel to another vector.
   * @param precision Set to zero for exact comparisons
   */
  isAntiparallelTo(vector: Vec3, precision: f32 = 1e-6): boolean {
    this.negate(antip_neg);
    return antip_neg.almostEquals(vector, precision);
  }

  /**
   * Clone the vector
   */
  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }
}

const Vec3_tangents_n = new Vec3();
const Vec3_tangents_randVec = new Vec3();
const antip_neg = new Vec3();
