import { Vec3 } from "./Vec3";

export class AxisAngle {
  constructor(public axis: Vec3 = new Vec3(), public angle: f32 = 0) {}
}

const sfv_t1 = new Vec3(),
  sfv_t2 = new Vec3();
// const Quaternion_mult_va = new Vec3();
// const Quaternion_mult_vb = new Vec3();
// const Quaternion_mult_vaxvb = new Vec3();
export class Quaternion {
  x: f32;
  y: f32;
  z: f32;
  w: f32;

  /**
   * A Quaternion describes a rotation in 3D space. The Quaternion is mathematically defined as Q = x*i + y*j + z*k + w, where (i,j,k) are imaginary basis vectors. (x,y,z) can be seen as a vector related to the axis of rotation, while the real multiplier, w, is related to the amount of rotation.
   * @class Quaternion
   * @constructor
   * @param {Number} x Multiplier of the imaginary basis vector i.
   * @param {Number} y Multiplier of the imaginary basis vector j.
   * @param {Number} z Multiplier of the imaginary basis vector k.
   * @param {Number} w Multiplier of the real part.
   * @see http://en.wikipedia.org/wiki/Quaternion
   */
  constructor(x: f32 = 0, y: f32 = 0, z: f32 = 0, w: f32 = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  // get x(): f32 {
  //   return this._x;
  // }
  // set x(value: f32) {
  //   // if (isNaN(value))
  //   //   throw new Error("Quaternion.x: " + value + " is not a valid number.");

  //   this._x = value;
  // }
  // get y(): f32 {
  //   return this._y;
  // }
  // set y(value: f32) {
  //   // if (isNaN(value))
  //   //   throw new Error("Quaternion.y: " + value + " is not a valid number.");
  //   this._y = value;
  // }
  // get z(): f32 {
  //   return this._z;
  // }
  // set z(value: f32) {
  //   // if (isNaN(value))
  //   //   throw new Error("Quaternion.z: " + value + " is not a valid number.");
  //   this._z = value;
  // }
  // get w(): f32 {
  //   return this._w;
  // }
  // set w(value: f32) {
  //   // if (isNaN(value))
  //   //   throw new Error("Quaternion.w: " + value + " is not a valid number.");
  //   this._w = value;
  // }

  /**
   * Set the value of the quaternion.
   * @method set
   * @param {Number} x
   * @param {Number} y
   * @param {Number} z
   * @param {Number} w
   */
  set(x: f32, y: f32, z: f32, w: f32): Quaternion {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  /**
   * Convert to a readable format
   * @method toString
   * @return string
   */
  toString(): string {
    return this.x + "," + this.y + "," + this.z + "," + this.w;
  }

  /**
   * Convert to an Array
   * @method toArray
   * @return Array
   */
  toArray(): f32[] {
    return [this.x, this.y, this.z, this.w];
  }

  /**
   * Set the quaternion components given an axis and an angle.
   * @method setFromAxisAngle
   * @param {Vec3} axis
   * @param {Number} angle in radians
   */
  setFromAxisAngle(axis: Vec3, angle: f32): Quaternion {
    const s = Mathf.sin(angle * 0.5);
    this.x = axis.x * s;
    this.y = axis.y * s;
    this.z = axis.z * s;
    this.w = Mathf.cos(angle * 0.5);
    return this;
  }

  /**
   * Converts the quaternion to axis/angle representation.
   * @method toAxisAngle
   * @param {Vec3} [targetAxis] A vector object to reuse for storing the axis.
   * @return {Array} An array, first elemnt is the axis and the second is the angle in radians.
   */
  toAxisAngle(targetAxis = new Vec3()): AxisAngle {
    this.normalize(); // if w>1 acos and sqrt will produce errors, this cant happen if quaternion is normalised
    const angle = 2 * Mathf.acos(this.w);
    const s = Mathf.sqrt(1 - this.w * this.w); // assuming quaternion normalised then w is less than 1, so term always positive.
    if (s < 0.001) {
      // test to avoid divide by zero, s is always positive due to sqrt
      // if s close to zero then direction of axis not important
      targetAxis.x = this.x; // if it is important that axis is normalised then replace with x=1; y=z=0;
      targetAxis.y = this.y;
      targetAxis.z = this.z;
    } else {
      targetAxis.x = this.x / s; // normalise axis
      targetAxis.y = this.y / s;
      targetAxis.z = this.z / s;
    }
    return new AxisAngle(targetAxis, angle);
  }

  /**
   * Set the quaternion value given two vectors. The resulting rotation will be the needed rotation to rotate u to v.
   * @method setFromVectors
   * @param {Vec3} u
   * @param {Vec3} v
   */
  setFromVectors(u: Vec3, v: Vec3): Quaternion {
    if (u.isAntiparallelTo(v)) {
      const t1 = sfv_t1;
      const t2 = sfv_t2;

      u.tangents(t1, t2);
      this.setFromAxisAngle(t1, Mathf.PI);
    } else {
      const a = u.cross(v);
      this.x = a.x;
      this.y = a.y;
      this.z = a.z;
      this.w =
        Mathf.sqrt(Mathf.pow(u.norm(), 2) * Mathf.pow(v.norm(), 2)) + u.dot(v);
      this.normalize();
    }
    return this;
  }

  /**
   * Quaternion multiplication
   * @method mult
   * @param {Quaternion} q
   * @param {Quaternion} target Optional.
   * @return {Quaternion}
   */

  mult(q: Quaternion, target: Quaternion = new Quaternion()): Quaternion {
    const ax = this.x,
      ay = this.y,
      az = this.z,
      aw = this.w,
      bx = q.x,
      by = q.y,
      bz = q.z,
      bw = q.w;

    target.x = ax * bw + aw * bx + ay * bz - az * by;
    target.y = ay * bw + aw * by + az * bx - ax * bz;
    target.z = az * bw + aw * bz + ax * by - ay * bx;
    target.w = aw * bw - ax * bx - ay * by - az * bz;

    return target;
  }

  /**
   * Get the inverse quaternion rotation.
   * @method inverse
   * @param {Quaternion} target
   * @return {Quaternion}
   */
  inverse(target: Quaternion): Quaternion {
    const x = this.x,
      y = this.y,
      z = this.z,
      w = this.w;
    target = target || new Quaternion();

    this.conjugate(target);
    const inorm2 = 1 / (x * x + y * y + z * z + w * w);
    target.x *= inorm2;
    target.y *= inorm2;
    target.z *= inorm2;
    target.w *= inorm2;

    return target;
  }

  /**
   * Get the quaternion conjugate
   * @method conjugate
   * @param {Quaternion} target
   * @return {Quaternion}
   */
  conjugate(target: Quaternion = new Quaternion()): Quaternion {
    target.x = -this.x;
    target.y = -this.y;
    target.z = -this.z;
    target.w = this.w;

    return target;
  }

  /**
   * Normalize the quaternion. Note that this changes the values of the quaternion.
   * @method normalize
   */
  normalize(): Quaternion {
    let l = Mathf.sqrt(
      this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w
    );
    if (l == 0) {
      this.x = 0;
      this.y = 0;
      this.z = 0;
      this.w = 0;
    } else {
      l = 1 / l;
      this.x *= l;
      this.y *= l;
      this.z *= l;
      this.w *= l;
    }
    return this;
  }

  /**
   * Approximation of quaternion normalization. Works best when quat is already almost-normalized.
   * @method normalizeFast
   * @see http://jsperf.com/fast-quaternion-normalization
   * @author unphased, https://github.com/unphased
   */
  normalizeFast(): Quaternion {
    const f: f32 =
      (3.0 -
        (this.x * this.x +
          this.y * this.y +
          this.z * this.z +
          this.w * this.w)) /
      2.0;
    if (f == 0) {
      this.x = 0;
      this.y = 0;
      this.z = 0;
      this.w = 0;
    } else {
      this.x *= f;
      this.y *= f;
      this.z *= f;
      this.w *= f;
    }
    return this;
  }

  /**
   * Multiply the quaternion by a vector
   * @method vmult
   * @param {Vec3} v
   * @param {Vec3} target Optional
   * @return {Vec3}
   */
  vmult(v: Vec3, target: Vec3 = new Vec3()): Vec3 {
    const x = v.x,
      y = v.y,
      z = v.z;

    const qx = this.x,
      qy = this.y,
      qz = this.z,
      qw = this.w;

    // q*v
    const ix = qw * x + qy * z - qz * y,
      iy = qw * y + qz * x - qx * z,
      iz = qw * z + qx * y - qy * x,
      iw = -qx * x - qy * y - qz * z;

    target.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    target.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    target.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;

    return target;
  }

  /**
   * Copies value of source to this quaternion.
   * @method copy
   * @param {Quaternion} source
   * @return {Quaternion} this
   */
  copy(source: Quaternion): Quaternion {
    this.x = source.x;
    this.y = source.y;
    this.z = source.z;
    this.w = source.w;
    return this;
  }

  /**
   * Convert the quaternion to euler angle representation. Order: YZX, as this page describes: http://www.euclideanspace.com/maths/standards/index.htm
   * @method toEuler
   * @param {Vec3} target
   * @param string order Three-character string e.g. "YZX", which also is default.
   */
  toEuler(target: Vec3, order: string): void {
    order = order || "YZX";

    let heading: f32, attitude: f32, bank: f32;
    const x = this.x,
      y = this.y,
      z = this.z,
      w = this.w;

    switch (order) {
      case "YZX":
        const test = x * y + z * w;
        if (test > 0.499) {
          // singularity at north pole
          heading = 2 * Mathf.atan2(x, w);
          attitude = Mathf.PI / 2;
          bank = 0;
        }
        if (test < -0.499) {
          // singularity at south pole
          heading = -2 * Mathf.atan2(x, w);
          attitude = -Mathf.PI / 2;
          bank = 0;
        }
        if (isNaN<f32>(heading!)) {
          const sqx = x * x;
          const sqy = y * y;
          const sqz = z * z;
          heading = Mathf.atan2(2 * y * w - 2 * x * z, 1 - 2 * sqy - 2 * sqz); // Heading
          attitude = Mathf.asin(2 * test); // attitude
          bank = Mathf.atan2(2 * x * w - 2 * y * z, 1 - 2 * sqx - 2 * sqz); // bank
        }
        break;
      default:
        throw new Error("Euler order " + order + " not supported yet.");
    }

    target.y = heading!;
    target.z = attitude!;
    target.x = bank!;
  }

  /**
   * See http://www.mathworks.com/matlabcentral/fileexchange/20696-function-to-convert-between-dcm-euler-angles-quaternions-and-euler-vectors/content/SpinCalc.m
   * @method setFromEuler
   * @param {Number} x
   * @param {Number} y
   * @param {Number} z
   * @param {String} order The order to apply angles: 'XYZ' or 'YXZ' or any other combination
   */
  setFromEuler(x: f32, y: f32, z: f32, order: string = "xyz"): Quaternion {
    const c1 = Mathf.cos(x / 2);
    const c2 = Mathf.cos(y / 2);
    const c3 = Mathf.cos(z / 2);
    const s1 = Mathf.sin(x / 2);
    const s2 = Mathf.sin(y / 2);
    const s3 = Mathf.sin(z / 2);

    if (order === "XYZ") {
      this.x = s1 * c2 * c3 + c1 * s2 * s3;
      this.y = c1 * s2 * c3 - s1 * c2 * s3;
      this.z = c1 * c2 * s3 + s1 * s2 * c3;
      this.w = c1 * c2 * c3 - s1 * s2 * s3;
    } else if (order === "YXZ") {
      this.x = s1 * c2 * c3 + c1 * s2 * s3;
      this.y = c1 * s2 * c3 - s1 * c2 * s3;
      this.z = c1 * c2 * s3 - s1 * s2 * c3;
      this.w = c1 * c2 * c3 + s1 * s2 * s3;
    } else if (order === "ZXY") {
      this.x = s1 * c2 * c3 - c1 * s2 * s3;
      this.y = c1 * s2 * c3 + s1 * c2 * s3;
      this.z = c1 * c2 * s3 + s1 * s2 * c3;
      this.w = c1 * c2 * c3 - s1 * s2 * s3;
    } else if (order === "ZYX") {
      this.x = s1 * c2 * c3 - c1 * s2 * s3;
      this.y = c1 * s2 * c3 + s1 * c2 * s3;
      this.z = c1 * c2 * s3 - s1 * s2 * c3;
      this.w = c1 * c2 * c3 + s1 * s2 * s3;
    } else if (order === "YZX") {
      this.x = s1 * c2 * c3 + c1 * s2 * s3;
      this.y = c1 * s2 * c3 + s1 * c2 * s3;
      this.z = c1 * c2 * s3 - s1 * s2 * c3;
      this.w = c1 * c2 * c3 - s1 * s2 * s3;
    } else if (order === "XZY") {
      this.x = s1 * c2 * c3 - c1 * s2 * s3;
      this.y = c1 * s2 * c3 - s1 * c2 * s3;
      this.z = c1 * c2 * s3 + s1 * s2 * c3;
      this.w = c1 * c2 * c3 + s1 * s2 * s3;
    }

    return this;
  }

  /**
   * @method clone
   * @return {Quaternion}
   */
  clone(): Quaternion {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }

  /**
   * Performs a spherical linear interpolation between two quat
   *
   * @method slerp
   * @param {Quaternion} toQuat second operand
   * @param {Number} t interpolation amount between the self quaternion and toQuat
   * @param {Quaternion} [target] A quaternion to store the result in. If not provided, a new one will be created.
   * @returns {Quaternion} The "target" object
   */
  slerp(
    toQuat: Quaternion,
    t: f32,
    target: Quaternion = new Quaternion()
  ): Quaternion {
    let ax = this.x,
      ay = this.y,
      az = this.z,
      aw = this.w,
      bx = toQuat.x,
      by = toQuat.y,
      bz = toQuat.z,
      bw = toQuat.w;

    let omega: f32, cosom: f32, sinom: f32, scale0: f32, scale1: f32;

    // calc cosine
    cosom = ax * bx + ay * by + az * bz + aw * bw;

    // adjust signs (if necessary)
    if (cosom < 0.0) {
      cosom = -cosom;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }

    // calculate coefficients
    if (1.0 - cosom > 0.000001) {
      // standard case (slerp)
      omega = Mathf.acos(cosom);
      sinom = Mathf.sin(omega);
      scale0 = Mathf.sin((1.0 - t) * omega) / sinom;
      scale1 = Mathf.sin(t * omega) / sinom;
    } else {
      // "from" and "to" quaternions are very close
      //  ... so we can do a linear interpolation
      scale0 = 1.0 - t;
      scale1 = t;
    }

    // calculate final values
    target.x = scale0 * ax + scale1 * bx;
    target.y = scale0 * ay + scale1 * by;
    target.z = scale0 * az + scale1 * bz;
    target.w = scale0 * aw + scale1 * bw;

    return target;
  }

  /**
   * Rotate an absolute orientation quaternion given an angular velocity and a time step.
   * @param  {Vec3} angularVelocity
   * @param  {number} dt
   * @param  {Vec3} angularFactor
   * @param  {Quaternion} target
   * @return {Quaternion} The "target" object
   */
  integrate(
    angularVelocity: Vec3,
    dt: f32,
    angularFactor: Vec3,
    target: Quaternion = new Quaternion()
  ): Quaternion {
    const ax = angularVelocity.x * angularFactor.x,
      ay = angularVelocity.y * angularFactor.y,
      az = angularVelocity.z * angularFactor.z,
      bx = this.x,
      by = this.y,
      bz = this.z,
      bw = this.w;

    const half_dt = dt * 0.5;

    target.x += half_dt * (ax * bw + ay * bz - az * by);
    target.y += half_dt * (ay * bw + az * bx - ax * bz);
    target.z += half_dt * (az * bw + ax * by - ay * bx);
    target.w += half_dt * (-ax * bx - ay * by - az * bz);

    return target;
  }
}
