import { Mat3 } from "./Mat3";

export class Vec3 {
  x: f32;
  y: f32;
  z: f32;
  static ZERO: Vec3 = new Vec3(0, 0, 0);
  static UNIT_X: Vec3 = new Vec3(1, 0, 0);
  static UNIT_Y: Vec3 = new Vec3(0, 1, 0);
  static UNIT_Z: Vec3 = new Vec3(0, 0, 1);

  /**
   * 3-dimensional vector
   * @class Vec3
   * @constructor
   * @param {Number} x
   * @param {Number} y
   * @param {Number} z
   * @author schteppe
   * @example
   *     const v = new Vec3(1, 2, 3);
   *     console.log('x=' + v.x); // x=1
   */
  constructor(x: f32 = 0, y: f32 = 0, z: f32 = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  // get x(): f32 {
  //   return this._x;
  // }
  // set x(value: f32) {
  //   // if (isNaN(value))
  //   //   throw new Error("Vector.x: " + value + " is not a valid number.");

  //   this._x = value;
  // }
  // get y(): f32 {
  //   return this._y;
  // }
  // set y(value: f32) {
  //   // if (isNaN(value))
  //   //   throw new Error("Vector.y: " + value + " is not a valid number.");
  //   this._y = value;
  // }
  // get z(): f32 {
  //   return this._z;
  // }
  // set z(value: f32) {
  //   // if (isNaN(value))
  //   //   throw new Error("Vector.z: " + value + " is not a valid number.");
  //   this._z = value;
  // }

  /**
   * Vector cross product
   * @method cross
   * @param {Vec3} a
   * @param {Vec3} target Optional. Target to save in.
   * @return {Vec3}
   */
  cross(a: Vec3, target: Vec3 = new Vec3()): Vec3 {
    const ax = a.x,
      ay = a.y,
      az = a.z,
      bx = this.x,
      by = this.y,
      bz = this.z;
    target = target || new Vec3();

    target.x = by * az - bz * ay;
    target.y = bz * ax - bx * az;
    target.z = bx * ay - by * ax;

    return target;
  }

  /**
   * Set the vectors' 3 elements
   * @method set
   * @param {Number} x
   * @param {Number} y
   * @param {Number} z
   * @return Vec3
   */
  set(x: f32, y: f32, z: f32): Vec3 {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  /**
   * Set all components of the vector to zero.
   * @method setZero
   */
  setZero(): void {
    this.x = this.y = this.z = 0;
  }

  /**
   * Vector addition
   * @method vadd
   * @param {Vec3} v
   * @param {Vec3} target Optional.
   * @return {Vec3}
   */
  vadd(v: Vec3, target: Vec3 | null): Vec3 {
    if (target) {
      target.x = v.x + this.x;
      target.y = v.y + this.y;
      target.z = v.z + this.z;
      return this;
    } else {
      return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z);
    }
  }

  /**
   * Vector subtraction
   * @method vsub
   * @param {Vec3} v
   * @param {Vec3} target Optional. Target to save in.
   * @return {Vec3}
   */
  vsub(v: Vec3, target: Vec3 | null): Vec3 {
    if (target) {
      target.x = this.x - v.x;
      target.y = this.y - v.y;
      target.z = this.z - v.z;
      return this;
    } else {
      return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z);
    }
  }

  /**
   * Get the cross product matrix a_cross from a vector, such that a x b = a_cross * b = c
   * @method crossmat
   * @see http://www8.cs.umu.se/kurser/TDBD24/VT06/lectures/Lecture6.pdf
   * @return {Mat3}
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
   * @method normalize
   * @return {Number} Returns the norm of the vector
   */
  normalize(): f32 {
    const x = this.x,
      y = this.y,
      z = this.z;
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
   * @method unit
   * @param {Vec3} target Optional target to save in
   * @return {Vec3} Returns the unit vector
   */
  unit(target: Vec3 = new Vec3()): Vec3 {
    const x = this.x,
      y = this.y,
      z = this.z;
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
   * @method norm
   * @return {Number}
   * @deprecated Use .length() instead
   */
  norm(): f32 {
    const x = this.x,
      y = this.y,
      z = this.z;
    return Mathf.sqrt(x * x + y * y + z * z);
  }

  /**
   * Get the length of the vector
   * @method length
   * @return {Number}
   */
  length(): f32 {
    return this.norm();
  }

  /**
   * Get the squared length of the vector
   * @method norm2
   * @return {Number}
   * @deprecated Use .lengthSquared() instead.
   */
  norm2(): f32 {
    return this.dot(this);
  }

  /**
   * Get the squared length of the vector.
   * @method lengthSquared
   * @return {Number}
   */
  lengthSquared(): f32 {
    return this.norm2();
  }

  /**
   * Get distance from this point to another point
   * @method distanceTo
   * @param  {Vec3} p
   * @return {Number}
   */
  distanceTo(p: Vec3): f32 {
    const x = this.x,
      y = this.y,
      z = this.z;
    const px = p.x,
      py = p.y,
      pz = p.z;
    return Mathf.sqrt(
      (px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z)
    );
  }

  /**
   * Get squared distance from this point to another point
   * @method distanceSquared
   * @param  {Vec3} p
   * @return {Number}
   */
  distanceSquared(p: Vec3): f32 {
    const x = this.x,
      y = this.y,
      z = this.z;
    const px = p.x,
      py = p.y,
      pz = p.z;
    return (px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z);
  }

  /**
   * Multiply all the components of the vector with a scalar.
   * @deprecated Use .scale instead
   * @method mult
   * @param {Number} scalar
   * @param {Vec3} target The vector to save the result in.
   * @return {Vec3}
   * @deprecated Use .scale() instead
   */
  mult(scalar: f32, target: Vec3): Vec3 {
    target = target || new Vec3();
    const x = this.x,
      y = this.y,
      z = this.z;
    target.x = scalar * x;
    target.y = scalar * y;
    target.z = scalar * z;
    return target;
  }

  /**
   * Multiply the vector with an other vector, component-wise.
   * @method mult
   * @param {Number} vector
   * @param {Vec3} target The vector to save the result in.
   * @return {Vec3}
   */
  vmul(vector: Vec3, target: Vec3): Vec3 {
    target = target || new Vec3();
    target.x = vector.x * this.x;
    target.y = vector.y * this.y;
    target.z = vector.z * this.z;
    return target;
  }

  /**
   * Multiply the vector with a scalar.
   * @method scale
   * @param {Number} scalar
   * @param {Vec3} target
   * @return {Vec3}
   */
  scale(scalar: f32, target: Vec3): Vec3 {
    return this.mult(scalar, target);
  }

  /**
   * Scale a vector and add it to this vector. Save the result in "target". (target = this + vector * scalar)
   * @method addScaledVector
   * @param {Number} scalar
   * @param {Vec3} vector
   * @param {Vec3} target The vector to save the result in.
   * @return {Vec3}
   */
  addScaledVector(scalar: f32, vector: Vec3, target: Vec3 = new Vec3()): Vec3 {
    target.x = this.x + scalar * vector.x;
    target.y = this.y + scalar * vector.y;
    target.z = this.z + scalar * vector.z;
    return target;
  }

  /**
   * Calculate dot product
   * @method dot
   * @param {Vec3} v
   * @return {Number}
   */
  dot(v: Vec3): f32 {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  /**
   * @method isZero
   * @return bool
   */
  isZero(): boolean {
    return this.x === 0 && this.y === 0 && this.z === 0;
  }

  /**
   * Make the vector point in the opposite direction.
   * @method negate
   * @param {Vec3} target Optional target to save in
   * @return {Vec3}
   */
  negate(target: Vec3 = new Vec3()): Vec3 {
    target.x = -this.x;
    target.y = -this.y;
    target.z = -this.z;
    return target;
  }

  /**
   * Compute two artificial tangents to the vector
   * @method tangents
   * @param {Vec3} t1 Vector object to save the first tangent in
   * @param {Vec3} t2 Vector object to save the second tangent in
   */

  tangents(t1: Vec3, t2: Vec3): void {
    const norm = this.norm();
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
   * @method toString
   * @return string
   */
  toString(): string {
    return (
      this.x.toString() + "," + this.y.toString() + "," + this.z.toString()
    );
  }

  /**
   * Converts to an array
   * @method toArray
   * @return Array
   */
  toArray(): f32[] {
    return [this.x, this.y, this.z];
  }

  /**
   * Copies value of source to this vector.
   * @method copy
   * @param {Vec3} source
   * @return {Vec3} this
   */
  copy(source: Vec3): Vec3 {
    this.x = source.x;
    this.y = source.y;
    this.z = source.z;
    return this;
  }

  /**
   * Do a linear interpolation between two vectors
   * @method lerp
   * @param {Vec3} v
   * @param {Number} t A number between 0 and 1. 0 will make this function return u, and 1 will make it return v. Numbers in between will generate a vector in between them.
   * @param {Vec3} target
   */
  lerp(v: Vec3, t: f32, target: Vec3): void {
    const x = this.x,
      y = this.y,
      z = this.z;
    target.x = x + (v.x - x) * t;
    target.y = y + (v.y - y) * t;
    target.z = z + (v.z - z) * t;
  }

  /**
   * Check if a vector equals is almost equal to another one.
   * @method almostEquals
   * @param {Vec3} v
   * @param {Number} precision
   * @return bool
   */
  almostEquals(v: Vec3, precision: f32 = 1e-6): boolean {
    if (
      Mathf.abs(this.x - v.x) > precision ||
      Mathf.abs(this.y - v.y) > precision ||
      Mathf.abs(this.z - v.z) > precision
    ) {
      return false;
    }
    return true;
  }

  /**
   * Check if a vector is almost zero
   * @method almostZero
   * @param {Number} precision
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
   * @method isAntiparallelTo
   * @param  {Vec3}  v
   * @param  {Number}  precision Set to zero for exact comparisons
   * @return {Boolean}
   */
  isAntiparallelTo(v: Vec3, precision: f32 = 1e-6): boolean {
    this.negate(antip_neg);
    return antip_neg.almostEquals(v, precision);
  }

  /**
   * Clone the vector
   * @method clone
   * @return {Vec3}
   */
  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }
}

const Vec3_tangents_n = new Vec3();
const Vec3_tangents_randVec = new Vec3();
const antip_neg = new Vec3();
