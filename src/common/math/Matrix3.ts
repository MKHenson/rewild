import { Matrix4 } from "./Matrix4";
import { Vector3 } from "./Vector3";

export class Matrix3 {
  isMatrix3: boolean = true;
  elements: Float32Array;

  constructor() {
    this.elements = new Float32Array(9);
    this.set(1, 0, 0, 0, 1, 0, 0, 0, 1);
  }

  set(n11: f32, n12: f32, n13: f32, n21: f32, n22: f32, n23: f32, n31: f32, n32: f32, n33: f32): Matrix3 {
    const te = this.elements;

    te[0] = n11;
    te[1] = n21;
    te[2] = n31;
    te[3] = n12;
    te[4] = n22;
    te[5] = n32;
    te[6] = n13;
    te[7] = n23;
    te[8] = n33;

    return this;
  }

  identity(): Matrix3 {
    this.set(1, 0, 0, 0, 1, 0, 0, 0, 1);

    return this;
  }

  copy(m: Matrix3): Matrix3 {
    const te = this.elements;
    const me = m.elements;

    te[0] = me[0];
    te[1] = me[1];
    te[2] = me[2];
    te[3] = me[3];
    te[4] = me[4];
    te[5] = me[5];
    te[6] = me[6];
    te[7] = me[7];
    te[8] = me[8];

    return this;
  }

  extractBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): Matrix3 {
    xAxis.setFromMatrix3Column(this, 0);
    yAxis.setFromMatrix3Column(this, 1);
    zAxis.setFromMatrix3Column(this, 2);

    return this;
  }

  setFromMatrix4(m: Matrix4): Matrix3 {
    const me = m.elements;

    this.set(me[0], me[4], me[8], me[1], me[5], me[9], me[2], me[6], me[10]);

    return this;
  }

  multiply(m: Matrix3): Matrix3 {
    return this.multiplyMatrices(this, m);
  }

  premultiply(m: Matrix3): Matrix3 {
    return this.multiplyMatrices(m, this);
  }

  multiplyMatrices(a: Matrix3, b: Matrix3): Matrix3 {
    const ae = a.elements;
    const be = b.elements;
    const te = this.elements;

    const a11 = ae[0],
      a12 = ae[3],
      a13 = ae[6];
    const a21 = ae[1],
      a22 = ae[4],
      a23 = ae[7];
    const a31 = ae[2],
      a32 = ae[5],
      a33 = ae[8];

    const b11 = be[0],
      b12 = be[3],
      b13 = be[6];
    const b21 = be[1],
      b22 = be[4],
      b23 = be[7];
    const b31 = be[2],
      b32 = be[5],
      b33 = be[8];

    te[0] = a11 * b11 + a12 * b21 + a13 * b31;
    te[3] = a11 * b12 + a12 * b22 + a13 * b32;
    te[6] = a11 * b13 + a12 * b23 + a13 * b33;

    te[1] = a21 * b11 + a22 * b21 + a23 * b31;
    te[4] = a21 * b12 + a22 * b22 + a23 * b32;
    te[7] = a21 * b13 + a22 * b23 + a23 * b33;

    te[2] = a31 * b11 + a32 * b21 + a33 * b31;
    te[5] = a31 * b12 + a32 * b22 + a33 * b32;
    te[8] = a31 * b13 + a32 * b23 + a33 * b33;

    return this;
  }

  multiplyScalar(s: f32): Matrix3 {
    const te = this.elements;

    te[0] *= s;
    te[3] *= s;
    te[6] *= s;
    te[1] *= s;
    te[4] *= s;
    te[7] *= s;
    te[2] *= s;
    te[5] *= s;
    te[8] *= s;

    return this;
  }

  determinant(): f32 {
    const te = this.elements;

    const a = te[0],
      b = te[1],
      c = te[2],
      d = te[3],
      e = te[4],
      f = te[5],
      g = te[6],
      h = te[7],
      i = te[8];

    return a * e * i - a * f * h - b * d * i + b * f * g + c * d * h - c * e * g;
  }

  invert(): Matrix3 {
    const te = this.elements,
      n11: f32 = te[0],
      n21: f32 = te[1],
      n31: f32 = te[2],
      n12: f32 = te[3],
      n22: f32 = te[4],
      n32: f32 = te[5],
      n13: f32 = te[6],
      n23: f32 = te[7],
      n33: f32 = te[8],
      t11: f32 = n33 * n22 - n32 * n23,
      t12: f32 = n32 * n13 - n33 * n12,
      t13: f32 = n23 * n12 - n22 * n13,
      det: f32 = n11 * t11 + n21 * t12 + n31 * t13;

    if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0);

    const detInv: f32 = 1 / det;

    te[0] = t11 * detInv;
    te[1] = (n31 * n23 - n33 * n21) * detInv;
    te[2] = (n32 * n21 - n31 * n22) * detInv;

    te[3] = t12 * detInv;
    te[4] = (n33 * n11 - n31 * n13) * detInv;
    te[5] = (n31 * n12 - n32 * n11) * detInv;

    te[6] = t13 * detInv;
    te[7] = (n21 * n13 - n23 * n11) * detInv;
    te[8] = (n22 * n11 - n21 * n12) * detInv;

    return this;
  }

  transpose(): Matrix3 {
    let tmp: f32;
    const m = this.elements;

    tmp = m[1];
    m[1] = m[3];
    m[3] = tmp;
    tmp = m[2];
    m[2] = m[6];
    m[6] = tmp;
    tmp = m[5];
    m[5] = m[7];
    m[7] = tmp;

    return this;
  }

  getNormalMatrix(matrix4: Matrix4): Matrix3 {
    return this.setFromMatrix4(matrix4).invert().transpose();
  }

  transposeIntoArray(r: f32[]): Matrix3 {
    const m = this.elements;

    r[0] = m[0];
    r[1] = m[3];
    r[2] = m[6];
    r[3] = m[1];
    r[4] = m[4];
    r[5] = m[7];
    r[6] = m[2];
    r[7] = m[5];
    r[8] = m[8];

    return this;
  }

  setUvTransform(tx: f32, ty: f32, sx: f32, sy: f32, rotation: f32, cx: f32, cy: f32): Matrix3 {
    const c: f32 = Mathf.cos(rotation);
    const s: f32 = Mathf.sin(rotation);

    this.set(
      sx * c,
      sx * s,
      -sx * (c * cx + s * cy) + cx + tx,
      -sy * s,
      sy * c,
      -sy * (-s * cx + c * cy) + cy + ty,
      0,
      0,
      1
    );

    return this;
  }

  scale(sx: f32, sy: f32): Matrix3 {
    const te = this.elements;

    te[0] *= sx;
    te[3] *= sx;
    te[6] *= sx;
    te[1] *= sy;
    te[4] *= sy;
    te[7] *= sy;

    return this;
  }

  rotate(theta: f32): Matrix3 {
    const c: f32 = Mathf.cos(theta);
    const s: f32 = Mathf.sin(theta);

    const te = this.elements;

    const a11: f32 = te[0],
      a12: f32 = te[3],
      a13: f32 = te[6];
    const a21: f32 = te[1],
      a22: f32 = te[4],
      a23: f32 = te[7];

    te[0] = c * a11 + s * a21;
    te[3] = c * a12 + s * a22;
    te[6] = c * a13 + s * a23;

    te[1] = -s * a11 + c * a21;
    te[4] = -s * a12 + c * a22;
    te[7] = -s * a13 + c * a23;

    return this;
  }

  translate(tx: f32, ty: f32): Matrix3 {
    const te = this.elements;

    te[0] += tx * te[2];
    te[3] += tx * te[5];
    te[6] += tx * te[8];
    te[1] += ty * te[2];
    te[4] += ty * te[5];
    te[7] += ty * te[8];

    return this;
  }

  equals(matrix: Matrix3): boolean {
    const te = this.elements;
    const me = matrix.elements;

    for (let i: u8 = 0; i < 9; i++) {
      if (te[i] !== me[i]) return false;
    }

    return true;
  }

  fromArray(array: Float32Array, offset: u32 = 0): Matrix3 {
    for (let i: u8 = 0; i < 9; i++) {
      this.elements[i] = array[i + offset];
    }

    return this;
  }

  toArray(array: f32[] = [], offset: u32 = 0): f32[] {
    const te = this.elements;

    array[offset] = te[0];
    array[offset + 1] = te[1];
    array[offset + 2] = te[2];

    array[offset + 3] = te[3];
    array[offset + 4] = te[4];
    array[offset + 5] = te[5];

    array[offset + 6] = te[6];
    array[offset + 7] = te[7];
    array[offset + 8] = te[8];

    return array;
  }

  clone(): Matrix3 {
    return new Matrix3().fromArray(this.elements);
  }
}
