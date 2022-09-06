import { Quaternion } from "./Quaternion";
import { Vector3 } from "./Vector3";
import { Matrix4 } from "./Matrix4";
import { clamp } from "./MathUtils";
import { EulerRotationOrder } from "./EulerOrder";

const _matrix = new Matrix4();
const _quaternion = new Quaternion();

export interface IEulerChangeListener {
  onEulerChanged(euer: Euler): void;
}

export class Euler {
  isEuler: bool = true;
  _x: f32;
  _y: f32;
  _z: f32;
  _order: EulerRotationOrder;
  _onChangeCallback: IEulerChangeListener | null;

  static DefaultOrder: EulerRotationOrder = 0; // TODO: This is supposed to be EulerRotationOrder.XYZ but it keeps failing >:/
  static RotationOrders: EulerRotationOrder[] = [
    EulerRotationOrder.XYZ,
    EulerRotationOrder.YZX,
    EulerRotationOrder.ZXY,
    EulerRotationOrder.XZY,
    EulerRotationOrder.YXZ,
    EulerRotationOrder.ZYX,
  ];

  constructor(x: f32 = 0, y: f32 = 0, z: f32 = 0, order: EulerRotationOrder = Euler.DefaultOrder) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order;
    this._onChangeCallback = null;
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

  get order(): EulerRotationOrder {
    return this._order;
  }

  set order(value: EulerRotationOrder) {
    this._order = value;
    this.onChangeCallback();
  }

  set(x: f32, y: f32, z: f32, order: EulerRotationOrder): Euler {
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order || this._order;

    this.onChangeCallback();

    return this;
  }

  clone(): Euler {
    return new Euler(this._x, this._y, this._z, this._order);
  }

  copy(euler: Euler): Euler {
    this._x = euler._x;
    this._y = euler._y;
    this._z = euler._z;
    this._order = euler._order;

    this.onChangeCallback();

    return this;
  }

  setFromRotationMatrix(m: Matrix4, order: EulerRotationOrder = Euler.DefaultOrder, update: boolean = true): Euler {
    // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

    const te = m.elements;
    const m11 = te[0],
      m12 = te[4],
      m13 = te[8];
    const m21 = te[1],
      m22 = te[5],
      m23 = te[9];
    const m31 = te[2],
      m32 = te[6],
      m33 = te[10];

    order = order || this._order;

    switch (order) {
      case EulerRotationOrder.XYZ:
        this._y = Mathf.asin(clamp(m13, -1, 1));

        if (Mathf.abs(m13) < 0.9999999) {
          this._x = Mathf.atan2(-m23, m33);
          this._z = Mathf.atan2(-m12, m11);
        } else {
          this._x = Mathf.atan2(m32, m22);
          this._z = 0;
        }

        break;

      case EulerRotationOrder.YXZ:
        this._x = Mathf.asin(-clamp(m23, -1, 1));

        if (Mathf.abs(m23) < 0.9999999) {
          this._y = Mathf.atan2(m13, m33);
          this._z = Mathf.atan2(m21, m22);
        } else {
          this._y = Mathf.atan2(-m31, m11);
          this._z = 0;
        }

        break;

      case EulerRotationOrder.ZXY:
        this._x = Mathf.asin(clamp(m32, -1, 1));

        if (Mathf.abs(m32) < 0.9999999) {
          this._y = Mathf.atan2(-m31, m33);
          this._z = Mathf.atan2(-m12, m22);
        } else {
          this._y = 0;
          this._z = Mathf.atan2(m21, m11);
        }

        break;

      case EulerRotationOrder.ZYX:
        this._y = Mathf.asin(-clamp(m31, -1, 1));

        if (Mathf.abs(m31) < 0.9999999) {
          this._x = Mathf.atan2(m32, m33);
          this._z = Mathf.atan2(m21, m11);
        } else {
          this._x = 0;
          this._z = Mathf.atan2(-m12, m22);
        }

        break;

      case EulerRotationOrder.YZX:
        this._z = Mathf.asin(clamp(m21, -1, 1));

        if (Mathf.abs(m21) < 0.9999999) {
          this._x = Mathf.atan2(-m23, m22);
          this._y = Mathf.atan2(-m31, m11);
        } else {
          this._x = 0;
          this._y = Mathf.atan2(m13, m33);
        }

        break;

      case EulerRotationOrder.XZY:
        this._z = Mathf.asin(-clamp(m12, -1, 1));

        if (Mathf.abs(m12) < 0.9999999) {
          this._x = Mathf.atan2(m32, m22);
          this._y = Mathf.atan2(m13, m11);
        } else {
          this._x = Mathf.atan2(-m23, m33);
          this._y = 0;
        }

        break;

      default:
        throw new Error(`THREE.Euler: .setFromRotationMatrix() encountered an unknown order: ${order}`);
    }

    this._order = order;

    if (update != false) this.onChangeCallback();

    return this;
  }

  setFromQuaternion(q: Quaternion, order: EulerRotationOrder = Euler.DefaultOrder, update: boolean = true): Euler {
    _matrix.makeRotationFromQuaternion(q);

    return this.setFromRotationMatrix(_matrix, order, update);
  }

  setFromVector3(v: Vector3, order: EulerRotationOrder): Euler {
    return this.set(v.x, v.y, v.z, order || this._order);
  }

  reorder(newOrder: EulerRotationOrder): Euler {
    // WARNING: this discards revolution information -bhouston

    _quaternion.setFromEuler(this, false);

    return this.setFromQuaternion(_quaternion, newOrder, false);
  }

  equals(euler: Euler): boolean {
    return euler._x === this._x && euler._y === this._y && euler._z === this._z && euler._order === this._order;
  }

  fromArray(array: f32[]): Euler {
    this._x = array[0];
    this._y = array[1];
    this._z = array[2];
    if (array[3] != undefined) this._order = array[3];

    this.onChangeCallback();

    return this;
  }

  toArray(array: f32[] = [], offset: u32 = 0): f32[] {
    array[offset] = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._order;

    return array;
  }

  toVector3(optionalResult: Vector3): Vector3 {
    if (optionalResult) {
      return optionalResult.set(this._x, this._y, this._z);
    } else {
      return new Vector3(this._x, this._y, this._z);
    }
  }

  private onChangeCallback(): void {
    if (this._onChangeCallback) this._onChangeCallback!.onEulerChanged(this);
  }

  _onChange(callback: IEulerChangeListener): Euler {
    this._onChangeCallback = callback;

    return this;
  }
}
