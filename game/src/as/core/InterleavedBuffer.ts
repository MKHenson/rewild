import * as MathUtils from "../../common/math/MathUtils";
import { UsageType } from "../../common/GLEnums";
import { BaseAttribute, UpdateRange, UploadCallback } from "./BufferAttribute";
import { InterleavedBufferAttribute } from "./InterleavedBufferAttribute";

export class InterleavedBuffer extends BaseAttribute {
  array: Float32Array;
  stride: u32;
  count: u32;
  usage: UsageType;
  updateRange: UpdateRange;
  uuid: string;

  constructor(array: Float32Array, stride: u32) {
    super();
    this.array = array;
    this.stride = stride;
    this.count = array != undefined ? array.length / stride : 0;

    this.usage = UsageType.STATIC_DRAW;
    this.updateRange = { offset: 0, count: -1 };

    this.version = 0;

    this.uuid = MathUtils.generateUUID();

    this.onUploadCallback = null;
  }

  set needsUpdate(value: boolean) {
    if (value === true) this.version++;
  }

  setUsage(value: UsageType): InterleavedBuffer {
    this.usage = value;

    return this;
  }

  clone(): InterleavedBuffer {
    return new InterleavedBuffer(this.array.slice(0), this.stride);
  }

  convertBufferAttribute(): BaseAttribute {
    return this;
  }

  getUsage(): UsageType {
    return UsageType.DYNAMIC_DRAW;
  }

  getArray(): ArrayBufferView {
    return this.array;
  }

  getUpdateRange(): UpdateRange | null {
    return this.updateRange;
  }

  copy(source: InterleavedBuffer): InterleavedBuffer {
    this.array = source.array.slice(0);
    this.count = source.count;
    this.stride = source.stride;
    this.usage = source.usage;

    return this;
  }

  copyAt(index1: u32, attribute: InterleavedBufferAttribute, index2: u32): InterleavedBuffer {
    index1 *= this.stride;
    index2 *= attribute.data.stride;

    // TODO: Cant assume its alway f32 :(
    const array = attribute.getArray() as Float32Array;
    for (let i = 0, l = this.stride; i < l; i++) {
      this.array[index1 + i] = array[index2 + i];
    }

    return this;
  }

  set(value: Float32Array, offset: i32 = 0): InterleavedBuffer {
    this.array.set(value, offset);

    return this;
  }

  // // TODO:
  // clone(data): InterleavedBuffer {
  //   if (data.arrayBuffers === undefined) {
  //     data.arrayBuffers = {};
  //   }

  //   if (this.array.buffer._uuid === undefined) {
  //     this.array.buffer._uuid = MathUtils.generateUUID();
  //   }

  //   if (data.arrayBuffers[this.array.buffer._uuid] === undefined) {
  //     data.arrayBuffers[this.array.buffer._uuid] = this.array.slice(0).buffer;
  //   }

  //   const array = new this.array.constructor(data.arrayBuffers[this.array.buffer._uuid]);

  //   const ib = new InterleavedBuffer(array, this.stride);
  //   ib.setUsage(this.usage);

  //   return ib;
  // }

  onUpload(callback: UploadCallback | null): InterleavedBuffer {
    this.onUploadCallback = callback;

    return this;
  }

  // toJSON( data ) {

  // 	if ( data.arrayBuffers === undefined ) {

  // 		data.arrayBuffers = {};

  // 	}

  // 	// generate UUID for array buffer if necessary

  // 	if ( this.array.buffer._uuid === undefined ) {

  // 		this.array.buffer._uuid = MathUtils.generateUUID();

  // 	}

  // 	if ( data.arrayBuffers[ this.array.buffer._uuid ] === undefined ) {

  // 		data.arrayBuffers[ this.array.buffer._uuid ] = Array.prototype.slice.call( new Uint32Array( this.array.buffer ) );

  // 	}

  // 	//

  // 	return {
  // 		uuid: this.uuid,
  // 		buffer: this.array.buffer._uuid,
  // 		type: this.array.constructor.name,
  // 		stride: this.stride
  // 	};

  // }
}
