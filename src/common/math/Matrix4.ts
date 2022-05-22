import { Vector3 } from "./Vector3";
import { EulerRotationOrder } from "./EulerOrder";
import { Euler } from "./Euler";
import { Matrix3 } from "./Matrix3";
import { Quaternion } from "./Quaternion";

export class Matrix4 {
  isMatrix4: boolean = true;
  elements: Float32Array;

  constructor() {
    this.elements = new Float32Array(16);
    this.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  }

  set(
    n11: f32,
    n12: f32,
    n13: f32,
    n14: f32,
    n21: f32,
    n22: f32,
    n23: f32,
    n24: f32,
    n31: f32,
    n32: f32,
    n33: f32,
    n34: f32,
    n41: f32,
    n42: f32,
    n43: f32,
    n44: f32
  ): Matrix4 {
    const te = this.elements;

    te[0] = n11;
    te[4] = n12;
    te[8] = n13;
    te[12] = n14;
    te[1] = n21;
    te[5] = n22;
    te[9] = n23;
    te[13] = n24;
    te[2] = n31;
    te[6] = n32;
    te[10] = n33;
    te[14] = n34;
    te[3] = n41;
    te[7] = n42;
    te[11] = n43;
    te[15] = n44;

    return this;
  }

  identity(): Matrix4 {
    this.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

    return this;
  }

  clone(): Matrix4 {
    return new Matrix4().fromArray(this.elements);
  }

  copy(m: Matrix4): Matrix4 {
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
    te[9] = me[9];
    te[10] = me[10];
    te[11] = me[11];
    te[12] = me[12];
    te[13] = me[13];
    te[14] = me[14];
    te[15] = me[15];

    return this;
  }

  copyPosition(m: Matrix4): Matrix4 {
    const te = this.elements,
      me = m.elements;

    te[12] = me[12];
    te[13] = me[13];
    te[14] = me[14];

    return this;
  }

  setFromMatrix3(m: Matrix3): Matrix4 {
    const me = m.elements;

    this.set(me[0], me[3], me[6], 0, me[1], me[4], me[7], 0, me[2], me[5], me[8], 0, 0, 0, 0, 1);

    return this;
  }

  extractBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): Matrix4 {
    xAxis.setFromMatrixColumn(this, 0);
    yAxis.setFromMatrixColumn(this, 1);
    zAxis.setFromMatrixColumn(this, 2);

    return this;
  }

  makeBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): Matrix4 {
    this.set(xAxis.x, yAxis.x, zAxis.x, 0, xAxis.y, yAxis.y, zAxis.y, 0, xAxis.z, yAxis.z, zAxis.z, 0, 0, 0, 0, 1);

    return this;
  }

  extractRotation(m: Matrix4): Matrix4 {
    // this method does not support reflection matrices

    const te = this.elements;
    const me = m.elements;

    const scaleX: f32 = 1 / _v1.setFromMatrixColumn(m, 0).length();
    const scaleY: f32 = 1 / _v1.setFromMatrixColumn(m, 1).length();
    const scaleZ: f32 = 1 / _v1.setFromMatrixColumn(m, 2).length();

    te[0] = me[0] * scaleX;
    te[1] = me[1] * scaleX;
    te[2] = me[2] * scaleX;
    te[3] = 0;

    te[4] = me[4] * scaleY;
    te[5] = me[5] * scaleY;
    te[6] = me[6] * scaleY;
    te[7] = 0;

    te[8] = me[8] * scaleZ;
    te[9] = me[9] * scaleZ;
    te[10] = me[10] * scaleZ;
    te[11] = 0;

    te[12] = 0;
    te[13] = 0;
    te[14] = 0;
    te[15] = 1;

    return this;
  }

  makeRotationFromEuler(euler: Euler): Matrix4 {
    if (!(euler && euler.isEuler)) {
      console.error(
        "THREE.Matrix4: .makeRotationFromEuler() now expects a Euler rotation rather than a Vector3 and order."
      );
    }

    const te = this.elements;

    const x = euler.x,
      y = euler.y,
      z = euler.z;
    const a = Mathf.cos(x),
      b = Mathf.sin(x);
    const c = Mathf.cos(y),
      d = Mathf.sin(y);
    const e = Mathf.cos(z),
      f = Mathf.sin(z);

    if (euler.order === EulerRotationOrder.XYZ) {
      const ae = a * e,
        af = a * f,
        be = b * e,
        bf = b * f;

      unchecked((te[0] = c * e));
      unchecked((te[4] = -c * f));
      unchecked((te[8] = d));

      unchecked((te[1] = af + be * d));
      unchecked((te[5] = ae - bf * d));
      unchecked((te[9] = -b * c));

      unchecked((te[2] = bf - ae * d));
      unchecked((te[6] = be + af * d));
      unchecked((te[10] = a * c));
    } else if (euler.order === EulerRotationOrder.YXZ) {
      const ce = c * e,
        cf = c * f,
        de = d * e,
        df = d * f;

      unchecked((te[0] = ce + df * b));
      unchecked((te[4] = de * b - cf));
      unchecked((te[8] = a * d));

      unchecked((te[1] = a * f));
      unchecked((te[5] = a * e));
      unchecked((te[9] = -b));

      unchecked((te[2] = cf * b - de));
      unchecked((te[6] = df + ce * b));
      unchecked((te[10] = a * c));
    } else if (euler.order === EulerRotationOrder.ZXY) {
      const ce = c * e,
        cf = c * f,
        de = d * e,
        df = d * f;

      unchecked((te[0] = ce - df * b));
      unchecked((te[4] = -a * f));
      unchecked((te[8] = de + cf * b));
      unchecked((te[1] = cf + de * b));
      unchecked((te[5] = a * e));
      unchecked((te[9] = df - ce * b));
      unchecked((te[2] = -a * d));
      unchecked((te[6] = b));
      unchecked((te[10] = a * c));
    } else if (euler.order === EulerRotationOrder.ZYX) {
      const ae = a * e,
        af = a * f,
        be = b * e,
        bf = b * f;

      unchecked((te[0] = c * e));
      unchecked((te[4] = be * d - af));
      unchecked((te[8] = ae * d + bf));
      unchecked((te[1] = c * f));
      unchecked((te[5] = bf * d + ae));
      unchecked((te[9] = af * d - be));
      unchecked((te[2] = -d));
      unchecked((te[6] = b * c));
      unchecked((te[10] = a * c));
    } else if (euler.order === EulerRotationOrder.YZX) {
      const ac = a * c,
        ad = a * d,
        bc = b * c,
        bd = b * d;

      unchecked((te[0] = c * e));
      unchecked((te[4] = bd - ac * f));
      unchecked((te[8] = bc * f + ad));
      unchecked((te[1] = f));
      unchecked((te[5] = a * e));
      unchecked((te[9] = -b * e));
      unchecked((te[2] = -d * e));
      unchecked((te[6] = ad * f + bc));
      unchecked((te[10] = ac - bd * f));
    } else if (euler.order === EulerRotationOrder.XZY) {
      const ac = a * c,
        ad = a * d,
        bc = b * c,
        bd = b * d;

      unchecked((te[0] = c * e));
      unchecked((te[4] = -f));
      unchecked((te[8] = d * e));
      unchecked((te[1] = ac * f + bd));
      unchecked((te[5] = a * e));
      unchecked((te[9] = ad * f - bc));
      unchecked((te[2] = bc * f - ad));
      unchecked((te[6] = b * e));
      unchecked((te[10] = bd * f + ac));
    }

    // bottom row
    te[3] = 0;
    te[7] = 0;
    te[11] = 0;

    // last column
    te[12] = 0;
    te[13] = 0;
    te[14] = 0;
    te[15] = 1;

    return this;
  }

  makeRotationFromQuaternion(q: Quaternion): Matrix4 {
    return this.compose(_zero, q, _one);
  }

  lookAt(eye: Vector3, target: Vector3, up: Vector3): Matrix4 {
    const te = this.elements;

    _z.subVectors(eye, target);

    if (_z.lengthSq() === 0) {
      // eye and target are in the same position

      _z.z = 1;
    }

    _z.normalize();
    _x.crossVectors(up, _z);

    if (_x.lengthSq() === 0) {
      // up and z are parallel

      if (Mathf.abs(up.z) === 1) {
        _z.x += 0.0001;
      } else {
        _z.z += 0.0001;
      }

      _z.normalize();
      _x.crossVectors(up, _z);
    }

    _x.normalize();
    _y.crossVectors(_z, _x);

    te[0] = _x.x;
    te[4] = _y.x;
    te[8] = _z.x;
    te[1] = _x.y;
    te[5] = _y.y;
    te[9] = _z.y;
    te[2] = _x.z;
    te[6] = _y.z;
    te[10] = _z.z;

    return this;
  }

  multiply(m: Matrix4): Matrix4 {
    return this.multiplyMatrices(this, m);
  }

  premultiply(m: Matrix4): Matrix4 {
    return this.multiplyMatrices(m, this);
  }

  multiplyMatrices(a: Matrix4, b: Matrix4): Matrix4 {
    const ae = a.elements;
    const be = b.elements;
    const te = this.elements;

    const a11 = unchecked(ae[0]),
      a12 = unchecked(ae[4]),
      a13 = unchecked(ae[8]),
      a14 = unchecked(ae[12]);
    const a21 = unchecked(ae[1]),
      a22 = unchecked(ae[5]),
      a23 = unchecked(ae[9]),
      a24 = unchecked(ae[13]);
    const a31 = unchecked(ae[2]),
      a32 = unchecked(ae[6]),
      a33 = unchecked(ae[10]),
      a34 = unchecked(ae[14]);
    const a41 = unchecked(ae[3]),
      a42 = unchecked(ae[7]),
      a43 = unchecked(ae[11]),
      a44 = unchecked(ae[15]);

    const b11 = unchecked(be[0]),
      b12 = unchecked(be[4]),
      b13 = unchecked(be[8]),
      b14 = unchecked(be[12]);
    const b21 = unchecked(be[1]),
      b22 = unchecked(be[5]),
      b23 = unchecked(be[9]),
      b24 = unchecked(be[13]);
    const b31 = unchecked(be[2]),
      b32 = unchecked(be[6]),
      b33 = unchecked(be[10]),
      b34 = unchecked(be[14]);
    const b41 = unchecked(be[3]),
      b42 = unchecked(be[7]),
      b43 = unchecked(be[11]),
      b44 = unchecked(be[15]);

    unchecked((te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41));
    unchecked((te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42));
    unchecked((te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43));
    unchecked((te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44));

    unchecked((te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41));
    unchecked((te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42));
    unchecked((te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43));
    unchecked((te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44));

    unchecked((te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41));
    unchecked((te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42));
    unchecked((te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43));
    unchecked((te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44));

    unchecked((te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41));
    unchecked((te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42));
    unchecked((te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43));
    unchecked((te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44));

    return this;
  }

  multiplyScalar(s: f32): Matrix4 {
    const te = this.elements;

    unchecked((te[0] *= s));
    unchecked((te[4] *= s));
    unchecked((te[8] *= s));
    unchecked((te[12] *= s));
    unchecked((te[1] *= s));
    unchecked((te[5] *= s));
    unchecked((te[9] *= s));
    unchecked((te[13] *= s));
    unchecked((te[2] *= s));
    unchecked((te[6] *= s));
    unchecked((te[10] *= s));
    unchecked((te[14] *= s));
    unchecked((te[3] *= s));
    unchecked((te[7] *= s));
    unchecked((te[11] *= s));
    unchecked((te[15] *= s));

    return this;
  }

  determinant(): f32 {
    const te = this.elements;

    const n11 = unchecked(te[0]),
      n12 = unchecked(te[4]),
      n13 = unchecked(te[8]),
      n14 = unchecked(te[12]);
    const n21 = unchecked(te[1]),
      n22 = unchecked(te[5]),
      n23 = unchecked(te[9]),
      n24 = unchecked(te[13]);
    const n31 = unchecked(te[2]),
      n32 = unchecked(te[6]),
      n33 = unchecked(te[10]),
      n34 = unchecked(te[14]);
    const n41 = unchecked(te[3]),
      n42 = unchecked(te[7]),
      n43 = unchecked(te[11]),
      n44 = unchecked(te[15]);

    //TODO: make this more efficient
    //( based on http://www.euclideanspace.com/maths/algebra/matrix/functions/inverse/fourD/index.htm )

    return (
      n41 *
        (+n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34) +
      n42 *
        (+n11 * n23 * n34 - n11 * n24 * n33 + n14 * n21 * n33 - n13 * n21 * n34 + n13 * n24 * n31 - n14 * n23 * n31) +
      n43 *
        (+n11 * n24 * n32 - n11 * n22 * n34 - n14 * n21 * n32 + n12 * n21 * n34 + n14 * n22 * n31 - n12 * n24 * n31) +
      n44 * (-n13 * n22 * n31 - n11 * n23 * n32 + n11 * n22 * n33 + n13 * n21 * n32 - n12 * n21 * n33 + n12 * n23 * n31)
    );
  }

  transpose(): Matrix4 {
    const te = this.elements;
    let tmp: f32;

    unchecked((tmp = te[1]));
    unchecked((te[1] = te[4]));
    unchecked((te[4] = tmp));
    unchecked((tmp = te[2]));
    unchecked((te[2] = te[8]));
    unchecked((te[8] = tmp));
    unchecked((tmp = te[6]));
    unchecked((te[6] = te[9]));
    unchecked((te[9] = tmp));
    unchecked((tmp = te[3]));
    unchecked((te[3] = te[12]));
    unchecked((te[12] = tmp));
    unchecked((tmp = te[7]));
    unchecked((te[7] = te[13]));
    unchecked((te[13] = tmp));
    unchecked((tmp = te[11]));
    unchecked((te[11] = te[14]));
    unchecked((te[14] = tmp));

    return this;
  }

  setPosition(x: f32, y: f32, z: f32): Matrix4 {
    const te = this.elements;

    unchecked((te[12] = x));
    unchecked((te[13] = y));
    unchecked((te[14] = z));

    return this;
  }

  invert(): Matrix4 {
    // based on http://www.euclideanspace.com/maths/algebra/matrix/functions/inverse/fourD/index.htm
    const te = this.elements,
      n11: f32 = unchecked(te[0]),
      n21: f32 = unchecked(te[1]),
      n31: f32 = unchecked(te[2]),
      n41: f32 = unchecked(te[3]),
      n12: f32 = unchecked(te[4]),
      n22: f32 = unchecked(te[5]),
      n32: f32 = unchecked(te[6]),
      n42: f32 = unchecked(te[7]),
      n13: f32 = unchecked(te[8]),
      n23: f32 = unchecked(te[9]),
      n33: f32 = unchecked(te[10]),
      n43: f32 = unchecked(te[11]),
      n14: f32 = unchecked(te[12]),
      n24: f32 = unchecked(te[13]),
      n34: f32 = unchecked(te[14]),
      n44: f32 = unchecked(te[15]),
      t11: f32 =
        n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44,
      t12: f32 =
        n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44,
      t13: f32 =
        n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44,
      t14: f32 =
        n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;

    const det: f32 = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;

    if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

    const detInv: f32 = 1 / det;

    unchecked((te[0] = t11 * detInv));
    unchecked(
      (te[1] =
        (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) *
        detInv)
    );
    unchecked(
      (te[2] =
        (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) *
        detInv)
    );
    unchecked(
      (te[3] =
        (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) *
        detInv)
    );
    unchecked((te[4] = t12 * detInv));
    unchecked(
      (te[5] =
        (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) *
        detInv)
    );
    unchecked(
      (te[6] =
        (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) *
        detInv)
    );
    unchecked(
      (te[7] =
        (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) *
        detInv)
    );
    unchecked((te[8] = t13 * detInv));
    unchecked(
      (te[9] =
        (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) *
        detInv)
    );
    unchecked(
      (te[10] =
        (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) *
        detInv)
    );
    unchecked(
      (te[11] =
        (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) *
        detInv)
    );
    unchecked((te[12] = t14 * detInv));
    unchecked(
      (te[13] =
        (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) *
        detInv)
    );
    unchecked(
      (te[14] =
        (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) *
        detInv)
    );
    unchecked(
      (te[15] =
        (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) *
        detInv)
    );

    return this;
  }

  scale(v: Vector3): Matrix4 {
    const te = this.elements;
    const x: f32 = v.x,
      y: f32 = v.y,
      z: f32 = v.z;

    unchecked((te[0] *= x));
    unchecked((te[4] *= y));
    unchecked((te[8] *= z));
    unchecked((te[1] *= x));
    unchecked((te[5] *= y));
    unchecked((te[9] *= z));
    unchecked((te[2] *= x));
    unchecked((te[6] *= y));
    unchecked((te[10] *= z));
    unchecked((te[3] *= x));
    unchecked((te[7] *= y));
    unchecked((te[11] *= z));

    return this;
  }

  getMaxScaleOnAxis(): f32 {
    const te = this.elements;

    const scaleXSq: f32 = te[0] * te[0] + te[1] * te[1] + te[2] * te[2];
    const scaleYSq: f32 = te[4] * te[4] + te[5] * te[5] + te[6] * te[6];
    const scaleZSq: f32 = te[8] * te[8] + te[9] * te[9] + te[10] * te[10];

    //Mathf.max only takes two arguments, have to do it twice.
    let maxScale: f32 = Mathf.max(scaleXSq, scaleYSq);
    maxScale = Mathf.max(maxScale, scaleZSq);
    return Mathf.sqrt(maxScale);
  }

  makeTranslation(x: f32, y: f32, z: f32): Matrix4 {
    this.set(1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1);

    return this;
  }

  makeRotationX(theta: f32): Matrix4 {
    const c: f32 = Mathf.cos(theta),
      s: f32 = Mathf.sin(theta);

    this.set(1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1);

    return this;
  }

  makeRotationY(theta: f32): Matrix4 {
    const c: f32 = Mathf.cos(theta),
      s: f32 = Mathf.sin(theta);

    this.set(c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1);

    return this;
  }

  makeRotationZ(theta: f32): Matrix4 {
    const c: f32 = Mathf.cos(theta),
      s: f32 = Mathf.sin(theta);

    this.set(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

    return this;
  }

  makeRotationAxis(axis: Vector3, angle: f32): Matrix4 {
    // Based on http://www.gamedev.net/reference/articles/article1199.asp

    const c: f32 = Mathf.cos(angle);
    const s: f32 = Mathf.sin(angle);
    const t: f32 = 1 - c;
    const x: f32 = axis.x,
      y: f32 = axis.y,
      z: f32 = axis.z;
    const tx: f32 = t * x,
      ty: f32 = t * y;

    this.set(
      tx * x + c,
      tx * y - s * z,
      tx * z + s * y,
      0,
      tx * y + s * z,
      ty * y + c,
      ty * z - s * x,
      0,
      tx * z - s * y,
      ty * z + s * x,
      t * z * z + c,
      0,
      0,
      0,
      0,
      1
    );

    return this;
  }

  makeScale(x: f32, y: f32, z: f32): Matrix4 {
    this.set(x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1);

    return this;
  }

  makeShear(xy: f32, xz: f32, yx: f32, yz: f32, zx: f32, zy: f32): Matrix4 {
    this.set(1, yx, zx, 0, xy, 1, zy, 0, xz, yz, 1, 0, 0, 0, 0, 1);

    return this;
  }

  compose(position: Vector3, quaternion: Quaternion, scale: Vector3): Matrix4 {
    const te = this.elements;

    const x: f32 = quaternion._x,
      y: f32 = quaternion._y,
      z: f32 = quaternion._z,
      w: f32 = quaternion._w;
    const x2: f32 = x + x,
      y2: f32 = y + y,
      z2: f32 = z + z;
    const xx: f32 = x * x2,
      xy: f32 = x * y2,
      xz: f32 = x * z2;
    const yy: f32 = y * y2,
      yz: f32 = y * z2,
      zz: f32 = z * z2;
    const wx = w * x2,
      wy: f32 = w * y2,
      wz: f32 = w * z2;

    const sx: f32 = scale.x,
      sy: f32 = scale.y,
      sz: f32 = scale.z;

    te[0] = (1 - (yy + zz)) * sx;
    te[1] = (xy + wz) * sx;
    te[2] = (xz - wy) * sx;
    te[3] = 0;

    te[4] = (xy - wz) * sy;
    te[5] = (1 - (xx + zz)) * sy;
    te[6] = (yz + wx) * sy;
    te[7] = 0;

    te[8] = (xz + wy) * sz;
    te[9] = (yz - wx) * sz;
    te[10] = (1 - (xx + yy)) * sz;
    te[11] = 0;

    te[12] = position.x;
    te[13] = position.y;
    te[14] = position.z;
    te[15] = 1;

    return this;
  }

  decompose(position: Vector3, quaternion: Quaternion, scale: Vector3): Matrix4 {
    const te = this.elements;

    let sx: f32 = _v1.set(te[0], te[1], te[2]).length();
    const sy: f32 = _v1.set(te[4], te[5], te[6]).length();
    const sz: f32 = _v1.set(te[8], te[9], te[10]).length();

    // if determine is negative, we need to invert one scale
    const det: f32 = this.determinant();
    if (det < 0) sx = -sx;

    position.x = te[12];
    position.y = te[13];
    position.z = te[14];

    // scale the rotation part
    _m1.copy(this);

    const invSX: f32 = 1 / sx;
    const invSY: f32 = 1 / sy;
    const invSZ: f32 = 1 / sz;

    _m1.elements[0] *= invSX;
    _m1.elements[1] *= invSX;
    _m1.elements[2] *= invSX;

    _m1.elements[4] *= invSY;
    _m1.elements[5] *= invSY;
    _m1.elements[6] *= invSY;

    _m1.elements[8] *= invSZ;
    _m1.elements[9] *= invSZ;
    _m1.elements[10] *= invSZ;

    quaternion.setFromRotationMatrix(_m1);

    scale.x = sx;
    scale.y = sy;
    scale.z = sz;

    return this;
  }

  makePerspective(left: f32, right: f32, top: f32, bottom: f32, near: f32, far: f32): Matrix4 {
    const te = this.elements;
    const x: f32 = (2 * near) / (right - left);
    const y: f32 = (2 * near) / (top - bottom);

    const a: f32 = (right + left) / (right - left);
    const b: f32 = (top + bottom) / (top - bottom);
    const c: f32 = -(far + near) / (far - near);
    const d: f32 = (-2 * far * near) / (far - near);

    te[0] = x;
    te[4] = 0;
    te[8] = a;
    te[12] = 0;
    te[1] = 0;
    te[5] = y;
    te[9] = b;
    te[13] = 0;
    te[2] = 0;
    te[6] = 0;
    te[10] = c;
    te[14] = d;
    te[3] = 0;
    te[7] = 0;
    te[11] = -1;
    te[15] = 0;

    return this;
  }

  makeOrthographic(left: f32, right: f32, top: f32, bottom: f32, near: f32, far: f32): Matrix4 {
    const te = this.elements;
    const w: f32 = 1.0 / (right - left);
    const h: f32 = 1.0 / (top - bottom);
    const p: f32 = 1.0 / (far - near);

    const x: f32 = (right + left) * w;
    const y: f32 = (top + bottom) * h;
    const z: f32 = (far + near) * p;

    te[0] = 2 * w;
    te[4] = 0;
    te[8] = 0;
    te[12] = -x;
    te[1] = 0;
    te[5] = 2 * h;
    te[9] = 0;
    te[13] = -y;
    te[2] = 0;
    te[6] = 0;
    te[10] = -2 * p;
    te[14] = -z;
    te[3] = 0;
    te[7] = 0;
    te[11] = 0;
    te[15] = 1;

    return this;
  }

  equals(matrix: Matrix4): boolean {
    const te = this.elements;
    const me = matrix.elements;

    for (let i: u8 = 0; i < 16; i++) {
      if (te[i] !== me[i]) return false;
    }

    return true;
  }

  fromArray(array: Float32Array, offset: u32 = 0): Matrix4 {
    for (let i: u8 = 0; i < 16; i++) {
      this.elements[i] = array[i + offset];
    }

    return this;
  }

  toArray(array: Float32Array, offset: u32 = 0): Float32Array {
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
    array[offset + 9] = te[9];
    array[offset + 10] = te[10];
    array[offset + 11] = te[11];

    array[offset + 12] = te[12];
    array[offset + 13] = te[13];
    array[offset + 14] = te[14];
    array[offset + 15] = te[15];

    return array;
  }
}

const _v1 = new Vector3();
const _m1 = new Matrix4();
const _zero = new Vector3(0, 0, 0);
const _one = new Vector3(1, 1, 1);
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
