//###########################################################################################
export class Vector3 {
  x: f32;
  y: f32;
  z: f32;

  constructor(x: f32 = 0, y: f32 = 0, z: f32 = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  magnitude(v: Vector3 | null): f32 {
    //Only get the magnitude of this vector
    if (v === null) return Mathf.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);

    //Get magnitude based on another vector
    var x = v.x - this.x,
      y = v.y - this.y,
      z = v.y - this.z;

    return Mathf.sqrt(x * x + y * y + z * z);
  }

  normalize(): Vector3 {
    const mag = this.magnitude(null);
    this.x /= mag;
    this.y /= mag;
    this.z /= mag;
    return this;
  }

  set(x: f32, y: f32, z: f32): Vector3 {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  multiScalar(v: f32): Vector3 {
    this.x *= v;
    this.y *= v;
    this.z *= v;
    return this;
  }

  getArray(): Float32Array {
    const toReturn = new Float32Array(3);
    toReturn[0] = this.x;
    toReturn[1] = this.y;
    toReturn[2] = this.z;
    return toReturn;
  }
  getFloatArray(): Float32Array {
    const toReturn = new Float32Array(3);
    toReturn[0] = this.x;
    toReturn[1] = this.y;
    toReturn[2] = this.z;
    return toReturn;
  }
  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }
}

//###########################################################################################
export class Matrix4 {
  raw: Float32Array;

  constructor() {
    this.raw = Matrix4.identity();
  }

  //....................................................................
  //Transformations Methods
  vtranslate(v: Vector3): Matrix4 {
    Matrix4.translate(this.raw, v.x, v.y, v.z);
    return this;
  }
  translate(x: f32, y: f32, z: f32): Matrix4 {
    Matrix4.translate(this.raw, x, y, z);
    return this;
  }

  rotateY(rad: f32): Matrix4 {
    Matrix4.rotateY(this.raw, rad);
    return this;
  }
  rotateX(rad: f32): Matrix4 {
    Matrix4.rotateX(this.raw, rad);
    return this;
  }
  rotateZ(rad: f32): Matrix4 {
    Matrix4.rotateZ(this.raw, rad);
    return this;
  }

  vscale(vec3: Vector3): Matrix4 {
    Matrix4.scale(this.raw, vec3.x, vec3.y, vec3.z);
    return this;
  }
  scale(x: f32, y: f32, z: f32): Matrix4 {
    Matrix4.scale(this.raw, x, y, z);
    return this;
  }

  invert(): Matrix4 {
    Matrix4.invert(this.raw, null);
    return this;
  }

  //....................................................................
  //Methods
  //Bring is back to identity without changing the transform values.
  resetRotation(): Matrix4 {
    for (var i = 0; i < this.raw.length; i++) {
      if (i >= 12 && i <= 14) continue;
      this.raw[i] = i % 5 == 0 ? 1 : 0; //only positions 0,5,10,15 need to be 1 else 0.
    }

    return this;
  }

  //reset data back to identity.
  reset(): Matrix4 {
    for (var i = 0; i < this.raw.length; i++) this.raw[i] = i % 5 == 0 ? 1 : 0; //only positions 0,5,10,15 need to be 1 else 0.
    return this;
  }

  //....................................................................
  //Static Data Methods
  static identity(): Float32Array {
    var a = new Float32Array(16);
    a[0] = a[5] = a[10] = a[15] = 1;
    return a;
  }

  //from glMatrix
  static perspective(out: Float32Array, fovy: f32, aspect: f32, near: f32, far: f32): void {
    var f: f32 = 1.0 / Mathf.tan(fovy / 2),
      nf: f32 = 1 / (near - far);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = 2 * far * near * nf;
    out[15] = 0;
  }

  static ortho(out: Float32Array, left: f32, right: f32, bottom: f32, top: f32, near: f32, far: f32): void {
    var lr: f32 = 1 / (left - right),
      bt: f32 = 1 / (bottom - top),
      nf: f32 = 1 / (near - far);
    out[0] = -2 * lr;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = -2 * bt;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 2 * nf;
    out[11] = 0;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
  }

  //https://github.com/toji/gl-matrix/blob/master/src/gl-matrix/mat4.js
  //make the rows into the columns
  static transpose(out: Float32Array, a: Float32Array): Float32Array {
    //If we are transposing ourselves we can skip a few steps but have to cache some values
    if (out === a) {
      var a01: f32 = a[1],
        a02: f32 = a[2],
        a03: f32 = a[3],
        a12: f32 = a[6],
        a13: f32 = a[7],
        a23: f32 = a[11];
      out[1] = a[4];
      out[2] = a[8];
      out[3] = a[12];
      out[4] = a01;
      out[6] = a[9];
      out[7] = a[13];
      out[8] = a02;
      out[9] = a12;
      out[11] = a[14];
      out[12] = a03;
      out[13] = a13;
      out[14] = a23;
    } else {
      out[0] = a[0];
      out[1] = a[4];
      out[2] = a[8];
      out[3] = a[12];
      out[4] = a[1];
      out[5] = a[5];
      out[6] = a[9];
      out[7] = a[13];
      out[8] = a[2];
      out[9] = a[6];
      out[10] = a[10];
      out[11] = a[14];
      out[12] = a[3];
      out[13] = a[7];
      out[14] = a[11];
      out[15] = a[15];
    }

    return out;
  }

  //Calculates a 3x3 normal matrix (transpose inverse) from the 4x4 matrix
  static normalMat3(out: Float32Array, a: Float32Array): Float32Array | null {
    var a00: f32 = a[0],
      a01: f32 = a[1],
      a02: f32 = a[2],
      a03: f32 = a[3],
      a10: f32 = a[4],
      a11: f32 = a[5],
      a12: f32 = a[6],
      a13: f32 = a[7],
      a20: f32 = a[8],
      a21: f32 = a[9],
      a22: f32 = a[10],
      a23: f32 = a[11],
      a30: f32 = a[12],
      a31: f32 = a[13],
      a32: f32 = a[14],
      a33: f32 = a[15],
      b00: f32 = a00 * a11 - a01 * a10,
      b01: f32 = a00 * a12 - a02 * a10,
      b02: f32 = a00 * a13 - a03 * a10,
      b03: f32 = a01 * a12 - a02 * a11,
      b04: f32 = a01 * a13 - a03 * a11,
      b05: f32 = a02 * a13 - a03 * a12,
      b06: f32 = a20 * a31 - a21 * a30,
      b07: f32 = a20 * a32 - a22 * a30,
      b08: f32 = a20 * a33 - a23 * a30,
      b09: f32 = a21 * a32 - a22 * a31,
      b10: f32 = a21 * a33 - a23 * a31,
      b11: f32 = a22 * a33 - a23 * a32,
      // Calculate the determinant
      det: f32 = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (!det) return null;

    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[2] = (a10 * b10 - a11 * b08 + a13 * b06) * det;

    out[3] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[4] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[5] = (a01 * b08 - a00 * b10 - a03 * b06) * det;

    out[6] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[7] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[8] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    return out;
  }

  //....................................................................
  //Static Operation

  //https://github.com/gregtatum/mdn-model-view-projection/blob/master/shared/matrices.js
  static multiplyVector(mat4: Float32Array, v: Float32Array): Float32Array {
    let x: f32 = v[0],
      y: f32 = v[1],
      z: f32 = v[2],
      w: f32 = v[3];
    let c1r1: f32 = mat4[0],
      c2r1: f32 = mat4[1],
      c3r1: f32 = mat4[2],
      c4r1: f32 = mat4[3],
      c1r2: f32 = mat4[4],
      c2r2: f32 = mat4[5],
      c3r2: f32 = mat4[6],
      c4r2: f32 = mat4[7],
      c1r3: f32 = mat4[8],
      c2r3: f32 = mat4[9],
      c3r3: f32 = mat4[10],
      c4r3: f32 = mat4[11],
      c1r4: f32 = mat4[12],
      c2r4: f32 = mat4[13],
      c3r4: f32 = mat4[14],
      c4r4: f32 = mat4[15];

    const toRet = new Float32Array(4);
    toRet[0] = x * c1r1 + y * c1r2 + z * c1r3 + w * c1r4;
    toRet[1] = x * c2r1 + y * c2r2 + z * c2r3 + w * c2r4;
    toRet[2] = x * c3r1 + y * c3r2 + z * c3r3 + w * c3r4;
    toRet[3] = x * c4r1 + y * c4r2 + z * c4r3 + w * c4r4;
    return toRet;
  }

  //https://github.com/toji/gl-matrix/blob/master/src/gl-matrix/vec4.js, vec4.transformMat4
  static transformVec4(out: Float32Array, v: Float32Array, m: Float32Array): Float32Array {
    out[0] = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3];
    out[1] = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3];
    out[2] = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3];
    out[3] = m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3];
    return out;
  }

  //From glMatrix
  //Multiple two mat4 together
  static mult(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
    var a00: f32 = a[0],
      a01: f32 = a[1],
      a02: f32 = a[2],
      a03: f32 = a[3],
      a10: f32 = a[4],
      a11: f32 = a[5],
      a12: f32 = a[6],
      a13: f32 = a[7],
      a20: f32 = a[8],
      a21: f32 = a[9],
      a22: f32 = a[10],
      a23: f32 = a[11],
      a30: f32 = a[12],
      a31: f32 = a[13],
      a32: f32 = a[14],
      a33: f32 = a[15];

    // Cache only the current line of the second matrix
    var b0: f32 = b[0],
      b1: f32 = b[1],
      b2: f32 = b[2],
      b3: f32 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4];
    b1 = b[5];
    b2 = b[6];
    b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8];
    b1 = b[9];
    b2 = b[10];
    b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12];
    b1 = b[13];
    b2 = b[14];
    b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
  }

  //....................................................................
  //Static Transformation
  static scale(out: Float32Array, x: f32, y: f32, z: f32): Float32Array {
    out[0] *= x;
    out[1] *= x;
    out[2] *= x;
    out[3] *= x;
    out[4] *= y;
    out[5] *= y;
    out[6] *= y;
    out[7] *= y;
    out[8] *= z;
    out[9] *= z;
    out[10] *= z;
    out[11] *= z;
    return out;
  }

  static rotateY(out: Float32Array, rad: f32): Float32Array {
    var s: f32 = Mathf.sin(rad),
      c: f32 = Mathf.cos(rad),
      a00: f32 = out[0],
      a01: f32 = out[1],
      a02: f32 = out[2],
      a03: f32 = out[3],
      a20: f32 = out[8],
      a21: f32 = out[9],
      a22: f32 = out[10],
      a23: f32 = out[11];

    // Perform axis-specific matrix multiplication
    out[0] = a00 * c - a20 * s;
    out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s;
    out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c;
    out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c;
    out[11] = a03 * s + a23 * c;
    return out;
  }

  static rotateX(out: Float32Array, rad: f32): Float32Array {
    var s: f32 = Mathf.sin(rad),
      c: f32 = Mathf.cos(rad),
      a10: f32 = out[4],
      a11: f32 = out[5],
      a12: f32 = out[6],
      a13: f32 = out[7],
      a20: f32 = out[8],
      a21: f32 = out[9],
      a22: f32 = out[10],
      a23: f32 = out[11];

    // Perform axis-specific matrix multiplication
    out[4] = a10 * c + a20 * s;
    out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s;
    out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s;
    out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s;
    out[11] = a23 * c - a13 * s;
    return out;
  }

  static rotateZ(out: Float32Array, rad: f32): Float32Array {
    var s: f32 = Mathf.sin(rad),
      c: f32 = Mathf.cos(rad),
      a00: f32 = out[0],
      a01: f32 = out[1],
      a02: f32 = out[2],
      a03: f32 = out[3],
      a10: f32 = out[4],
      a11: f32 = out[5],
      a12: f32 = out[6],
      a13: f32 = out[7];

    // Perform axis-specific matrix multiplication
    out[0] = a00 * c + a10 * s;
    out[1] = a01 * c + a11 * s;
    out[2] = a02 * c + a12 * s;
    out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s;
    out[5] = a11 * c - a01 * s;
    out[6] = a12 * c - a02 * s;
    out[7] = a13 * c - a03 * s;
    return out;
  }

  static rotate(out: Float32Array, rad: f32, axis: Float32Array): void {
    let x: f32 = axis[0],
      y: f32 = axis[1],
      z: f32 = axis[2],
      len: u32 = Mathf.sqrt(x * x + y * y + z * z),
      s: f32,
      c: f32,
      t: f32,
      a00: f32,
      a01: f32,
      a02: f32,
      a03: f32,
      a10: f32,
      a11: f32,
      a12: f32,
      a13: f32,
      a20: f32,
      a21: f32,
      a22: f32,
      a23: f32,
      b00: f32,
      b01: f32,
      b02: f32,
      b10: f32,
      b11: f32,
      b12: f32,
      b20: f32,
      b21: f32,
      b22: f32;

    if (Mathf.abs(len) < 0.000001) {
      return;
    }

    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;

    s = Mathf.sin(rad);
    c = Mathf.cos(rad);
    t = 1 - c;

    a00 = out[0];
    a01 = out[1];
    a02 = out[2];
    a03 = out[3];
    a10 = out[4];
    a11 = out[5];
    a12 = out[6];
    a13 = out[7];
    a20 = out[8];
    a21 = out[9];
    a22 = out[10];
    a23 = out[11];

    // Construct the elements of the rotation matrix
    b00 = x * x * t + c;
    b01 = y * x * t + z * s;
    b02 = z * x * t - y * s;
    b10 = x * y * t - z * s;
    b11 = y * y * t + c;
    b12 = z * y * t + x * s;
    b20 = x * z * t + y * s;
    b21 = y * z * t - x * s;
    b22 = z * z * t + c;

    // Perform rotation-specific matrix multiplication
    out[0] = a00 * b00 + a10 * b01 + a20 * b02;
    out[1] = a01 * b00 + a11 * b01 + a21 * b02;
    out[2] = a02 * b00 + a12 * b01 + a22 * b02;
    out[3] = a03 * b00 + a13 * b01 + a23 * b02;
    out[4] = a00 * b10 + a10 * b11 + a20 * b12;
    out[5] = a01 * b10 + a11 * b11 + a21 * b12;
    out[6] = a02 * b10 + a12 * b11 + a22 * b12;
    out[7] = a03 * b10 + a13 * b11 + a23 * b12;
    out[8] = a00 * b20 + a10 * b21 + a20 * b22;
    out[9] = a01 * b20 + a11 * b21 + a21 * b22;
    out[10] = a02 * b20 + a12 * b21 + a22 * b22;
    out[11] = a03 * b20 + a13 * b21 + a23 * b22;
  }

  static invert(out: Float32Array, mat: Float32Array | null): boolean {
    if (mat === null) mat = out; //If input isn't sent, then output is also input

    let a00: f32 = mat[0],
      a01: f32 = mat[1],
      a02: f32 = mat[2],
      a03: f32 = mat[3],
      a10: f32 = mat[4],
      a11: f32 = mat[5],
      a12: f32 = mat[6],
      a13: f32 = mat[7],
      a20: f32 = mat[8],
      a21: f32 = mat[9],
      a22: f32 = mat[10],
      a23: f32 = mat[11],
      a30: f32 = mat[12],
      a31: f32 = mat[13],
      a32: f32 = mat[14],
      a33: f32 = mat[15],
      b00: f32 = a00 * a11 - a01 * a10,
      b01: f32 = a00 * a12 - a02 * a10,
      b02: f32 = a00 * a13 - a03 * a10,
      b03: f32 = a01 * a12 - a02 * a11,
      b04: f32 = a01 * a13 - a03 * a11,
      b05: f32 = a02 * a13 - a03 * a12,
      b06: f32 = a20 * a31 - a21 * a30,
      b07: f32 = a20 * a32 - a22 * a30,
      b08: f32 = a20 * a33 - a23 * a30,
      b09: f32 = a21 * a32 - a22 * a31,
      b10: f32 = a21 * a33 - a23 * a31,
      b11: f32 = a22 * a33 - a23 * a32,
      // Calculate the determinant
      det: f32 = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (!det) return false;
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

    return true;
  }

  //https://github.com/toji/gl-matrix/blob/master/src/gl-matrix/mat4.js  mat4.scalar.translate = function (out, a, v) {
  static translate(out: Float32Array, x: f32, y: f32, z: f32): void {
    out[12] = out[0] * x + out[4] * y + out[8] * z + out[12];
    out[13] = out[1] * x + out[5] * y + out[9] * z + out[13];
    out[14] = out[2] * x + out[6] * y + out[10] * z + out[14];
    out[15] = out[3] * x + out[7] * y + out[11] * z + out[15];
  }
}
