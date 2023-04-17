import { EngineVector4 } from "../math/Vector4";
import { EngineVector3 } from "../math/Vector3";
import { EngineVector2 } from "../math/Vector2";
import { Color, UsageType, Matrix3 } from "rewild-common";
import { EngineMatrix4 } from "../math/Matrix4";

export class CloneToken {}
const _vector = new EngineVector3();
const _vector2 = new EngineVector2();
export class UpdateRange {
  offset: u32;
  count: i32;

  constructor() {
    this.offset = 0;
    this.count = -1;
  }
}

export type UploadCallback = () => void;

export abstract class BaseAttribute {
  name: string;
  itemSize: u32;
  version: i32;
  onUploadCallback: UploadCallback | null;
  normalized: boolean;

  constructor() {
    this.name = "";
    this.itemSize = 0;
    this.onUploadCallback = null;
    this.normalized = false;
  }

  abstract clone(data: CloneToken): BaseAttribute;

  merge(source: BaseAttribute, offset: i32): BaseAttribute {
    return this;
  }

  abstract convertBufferAttribute(indices: TypedArray<u32>): BaseAttribute;
  abstract getUpdateRange(): UpdateRange | null;
  abstract getArray(): ArrayBufferView;
  abstract getUsage(): UsageType;
}

export class BufferAttribute<K, T extends TypedArray<K>> extends BaseAttribute {
  count: u32;
  usage: UsageType;
  array: T;
  updateRange: UpdateRange;

  constructor(array: T, itemSize: u32, normalized: boolean = false) {
    super();
    this.array = array;
    this.itemSize = itemSize;
    this.count = array.length / itemSize;
    this.normalized = normalized === true;

    this.usage = UsageType.STATIC_DRAW;
    this.updateRange = new UpdateRange();

    this.version = 0;
  }

  getUpdateRange(): UpdateRange | null {
    return this.updateRange;
  }

  getArray(): ArrayBufferView {
    return this.array;
  }

  getUsage(): UsageType {
    return this.usage;
  }

  convertBufferAttribute(indices: TypedArray<u32>): BaseAttribute {
    const array = this.array;
    const itemSize = this.itemSize;
    const normalized = this.normalized;

    const array2 = array.slice(0) as T;

    let index: i32 = 0,
      index2: i32 = 0;

    for (let i = 0, l = indices.length; i < l; i++) {
      index = indices[i] * itemSize;

      for (let j = 0; j < itemSize; j++) {
        array2[index2++] = array[index++];
      }
    }

    return new BufferAttribute<K, T>(array2, itemSize, normalized);
  }

  merge(sourceAttr: BaseAttribute, offset: i32): BaseAttribute {
    const source = sourceAttr as BufferAttribute<K, T>;
    if (!source) return this;

    const attribute1 = this;
    const attributeArray1 = attribute1.array;

    const attribute2 = source;
    const attributeArray2 = attribute2.array;

    const attributeOffset: u32 = attribute2.itemSize * offset;
    const length = Math.min(attributeArray2.length, attributeArray1.length - attributeOffset);

    for (let i: i32 = 0, j: u32 = attributeOffset; i < length; i++, j++) {
      attributeArray1[j] = attributeArray2[i];
    }

    // const attributeOffset: u32 = source.itemSize * offset;
    // const length = Math.min(source.array.length, source.array.length - attributeOffset);

    // for (let i: i32 = 0, j: u32 = attributeOffset; i < length; i++, j++) {
    //   this.array[j] = source.array[i];
    // }

    return this;
  }

  set needsUpdate(value: boolean) {
    if (value === true) this.version++;
  }

  setUsage(value: UsageType): BufferAttribute<K, T> {
    this.usage = value;

    return this;
  }

  copy(source: BufferAttribute<K, T>, array: T): BufferAttribute<K, T> {
    this.name = source.name;
    this.array = array;
    this.itemSize = source.itemSize;
    this.count = source.count;
    this.normalized = source.normalized;

    this.usage = source.usage;

    return this;
  }

  copyAt(index1: u32, attribute: BufferAttribute<K, T>, index2: u32): BufferAttribute<K, T> {
    index1 *= this.itemSize;
    index2 *= attribute.itemSize;

    for (let i = 0, l = this.itemSize; i < l; i++) {
      this.array[index1 + i] = attribute.array[index2 + i];
    }

    return this;
  }

  copyArray(array: TypedArray<T>): BufferAttribute<K, T> {
    this.array.set(array);

    return this;
  }

  static copyColorsArray(
    colors: Color[],
    buffer: BufferAttribute<f32, Float32Array>
  ): BufferAttribute<f32, Float32Array> {
    const array = buffer.array;
    let offset = 0;

    for (let i = 0, l = colors.length; i < l; i++) {
      let color = colors[i];
      array[offset++] = color.r;
      array[offset++] = color.g;
      array[offset++] = color.b;
    }

    return buffer;
  }

  static copyVector2sArray(
    vectors: EngineVector2[],
    buffer: BufferAttribute<f32, Float32Array>
  ): BufferAttribute<f32, Float32Array> {
    const array = buffer.array;
    let offset = 0;

    for (let i = 0, l = vectors.length; i < l; i++) {
      let vector = vectors[i];
      array[offset++] = vector.x;
      array[offset++] = vector.y;
    }

    return buffer;
  }

  static copyVector3sArray(
    vectors: EngineVector3[],
    buffer: BufferAttribute<f32, Float32Array>
  ): BufferAttribute<f32, Float32Array> {
    const array = buffer.array;
    let offset = 0;

    for (let i = 0, l = vectors.length; i < l; i++) {
      let vector = vectors[i];
      array[offset++] = vector.x;
      array[offset++] = vector.y;
      array[offset++] = vector.z;
    }

    return buffer;
  }

  static copyVector4sArray(
    vectors: EngineVector4[],
    buffer: BufferAttribute<f32, Float32Array>
  ): BufferAttribute<f32, Float32Array> {
    const array = buffer.array;
    let offset = 0;

    for (let i = 0, l = vectors.length; i < l; i++) {
      let vector = vectors[i];
      array[offset++] = vector.x;
      array[offset++] = vector.y;
      array[offset++] = vector.z;
      array[offset++] = vector.w;
    }

    return buffer;
  }

  static applyMatrix3(m: Matrix3, buffer: BufferAttribute<f32, Float32Array>): BufferAttribute<f32, Float32Array> {
    if (buffer.itemSize === 2) {
      for (let i = 0, l = buffer.count; i < l; i++) {
        _vector2.fromBufferAttribute(buffer, i);
        _vector2.applyMatrix3(m);

        buffer.setXY(i, _vector2.x, _vector2.y);
      }
    } else if (buffer.itemSize === 3) {
      for (let i = 0, l = buffer.count; i < l; i++) {
        _vector.fromBufferAttribute(buffer, i);
        _vector.applyMatrix3(m);

        buffer.setXYZ(i, _vector.x, _vector.y, _vector.z);
      }
    }

    return buffer;
  }

  static applyMatrix4(
    m: EngineMatrix4,
    buffer: BufferAttribute<f32, Float32Array>
  ): BufferAttribute<f32, Float32Array> {
    for (let i: u32 = 0, l = buffer.count; i < l; i++) {
      _vector.x = buffer.getX(i);
      _vector.y = buffer.getY(i);
      _vector.z = buffer.getZ(i);

      _vector.applyMatrix4(m);

      buffer.setXYZ(i, _vector.x, _vector.y, _vector.z);
    }

    return buffer;
  }

  static applyNormalMatrix(m: Matrix3, buffer: BufferAttribute<f32, Float32Array>): BufferAttribute<f32, Float32Array> {
    for (let i: u32 = 0, l = buffer.count; i < l; i++) {
      _vector.x = buffer.getX(i);
      _vector.y = buffer.getY(i);
      _vector.z = buffer.getZ(i);

      _vector.applyNormalMatrix(m);

      buffer.setXYZ(i, _vector.x, _vector.y, _vector.z);
    }

    return buffer;
  }

  static transformDirection(
    m: EngineMatrix4,
    buffer: BufferAttribute<f32, Float32Array>
  ): BufferAttribute<f32, Float32Array> {
    for (let i: u32 = 0, l = buffer.count; i < l; i++) {
      _vector.x = buffer.getX(i);
      _vector.y = buffer.getY(i);
      _vector.z = buffer.getZ(i);

      _vector.transformDirection(m);

      buffer.setXYZ(i, _vector.x, _vector.y, _vector.z);
    }

    return buffer;
  }

  set(value: ArrayBufferView, offset = 0): BufferAttribute<K, T> {
    this.array.set(value, offset);

    return this;
  }

  getX(index: u32): K {
    return this.array[index * this.itemSize];
  }

  setX(index: u32, x: K): BufferAttribute<K, T> {
    this.array[index * this.itemSize] = x;

    return this;
  }

  getY(index: u32): K {
    return this.array[index * this.itemSize + 1];
  }

  setY(index: u32, y: K): BufferAttribute<K, T> {
    this.array[index * this.itemSize + 1] = y;

    return this;
  }

  getZ(index: u32): K {
    return this.array[index * this.itemSize + 2];
  }

  setZ(index: u32, z: K): BufferAttribute<K, T> {
    this.array[index * this.itemSize + 2] = z;

    return this;
  }

  getW(index: u32): K {
    return this.array[index * this.itemSize + 3];
  }

  setW(index: u32, w: K): BufferAttribute<K, T> {
    this.array[index * this.itemSize + 3] = w;

    return this;
  }

  setXY(index: u32, x: K, y: K): BufferAttribute<K, T> {
    index *= this.itemSize;

    this.array[index + 0] = x;
    this.array[index + 1] = y;

    return this;
  }

  setXYZ(index: u32, x: K, y: K, z: K): BufferAttribute<K, T> {
    index *= this.itemSize;

    this.array[index + 0] = x;
    this.array[index + 1] = y;
    this.array[index + 2] = z;

    return this;
  }

  setXYZW(index: u32, x: K, y: K, z: K, w: K): BufferAttribute<K, T> {
    index *= this.itemSize;

    this.array[index + 0] = x;
    this.array[index + 1] = y;
    this.array[index + 2] = z;
    this.array[index + 3] = w;

    return this;
  }

  onUpload(callback: UploadCallback | null): BufferAttribute<K, T> {
    this.onUploadCallback = callback;

    return this;
  }

  clone(token: CloneToken | null): BufferAttribute<K, T> {
    return new BufferAttribute<K, T>(this.array, this.itemSize, this.normalized).copy(this, this.array.slice(0) as T);
  }

  // TODO:
  //   toJSON() {
  //     const data = {
  //       itemSize: this.itemSize,
  //       type: this.array.constructor.name,
  //       array: Array.prototype.slice.call(this.array),
  //       normalized: this.normalized,
  //     };

  //     if (this.name != "") data.name = this.name;
  //     if (this.usage != StaticDrawUsage) data.usage = this.usage;
  //     if (this.updateRange.offset != 0 || this.updateRange.count != -1)
  //       data.updateRange = this.updateRange;

  //     return data;
  //   }
}

//

export class Int8BufferAttribute extends BufferAttribute<i8, Int8Array> {
  constructor(array: Int8Array, itemSize: u32, normalized: boolean = false) {
    super(array, itemSize, normalized);
  }
}

export class Uint8BufferAttribute extends BufferAttribute<u8, Uint8Array> {
  constructor(array: Uint8Array, itemSize: u32, normalized: boolean = false) {
    super(array, itemSize, normalized);
  }
}

export class Uint8ClampedBufferAttribute extends BufferAttribute<u8, Uint8ClampedArray> {
  constructor(array: Uint8ClampedArray, itemSize: u32, normalized: boolean = false) {
    super(array, itemSize, normalized);
  }
}

export class Int16BufferAttribute extends BufferAttribute<i16, Int16Array> {
  constructor(array: Int16Array, itemSize: u32, normalized: boolean = false) {
    super(array, itemSize, normalized);
  }
}

export class Uint16BufferAttribute extends BufferAttribute<u16, Uint16Array> {
  constructor(array: Uint16Array, itemSize: u32, normalized: boolean = false) {
    super(array, itemSize, normalized);
  }
}

export class Int32BufferAttribute extends BufferAttribute<i32, Int32Array> {
  constructor(array: Int32Array, itemSize: u32, normalized: boolean = false) {
    super(array, itemSize, normalized);
  }
}

export class Uint32BufferAttribute extends BufferAttribute<u32, Uint32Array> {
  constructor(array: Uint32Array, itemSize: u32, normalized: boolean = false) {
    super(array, itemSize, normalized);
  }
}

export class Float16BufferAttribute extends BufferAttribute<u16, Uint16Array> {
  constructor(array: Uint16Array, itemSize: u32, normalized: boolean) {
    super(array, itemSize, normalized);
  }
}

export class Float32BufferAttribute extends BufferAttribute<f32, Float32Array> {
  constructor(array: Float32Array, itemSize: u32, normalized: boolean = false) {
    super(array, itemSize, normalized);
  }
}

export class Float64BufferAttribute extends BufferAttribute<f64, Float64Array> {
  constructor(array: Float64Array, itemSize: u32, normalized: boolean = false) {
    super(array, itemSize, normalized);
  }
}
