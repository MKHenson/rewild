import { UsageType } from "../../common/GLEnums";
import { Matrix3 } from "../math/Matrix3";
import { Matrix4 } from "../math/Matrix4";
import { Vector3 } from "../math/Vector3";
import { BaseAttribute, CloneToken, Float32BufferAttribute, UpdateRange } from "./BufferAttribute";
// import { BufferAttribute } from "./BufferAttribute";
import { InterleavedBuffer } from "./InterleavedBuffer";

const _vector = new Vector3();

export class InterleavedBufferAttribute extends BaseAttribute {
  data: InterleavedBuffer;
  offset: u32;

  constructor(interleavedBuffer: InterleavedBuffer, itemSize: u32, offset: u32, normalized: boolean = false) {
    super();
    this.name = "";

    this.data = interleavedBuffer;
    this.itemSize = itemSize;
    this.offset = offset;

    this.normalized = normalized;
  }

  get count(): u32 {
    return this.data.count;
  }

  set needsUpdate(value: boolean) {
    this.data.needsUpdate = value;
  }

  clone(token: CloneToken | null): BaseAttribute {
    return new InterleavedBufferAttribute(
      new InterleavedBuffer(this.data.array.slice(0), this.data.stride),
      this.itemSize,
      this.offset,
      this.normalized
    );
  }

  getArray(): ArrayBufferView {
    return this.data.array;
  }

  getUsage(): UsageType {
    return UsageType.DYNAMIC_DRAW;
  }

  convertBufferAttribute(indices: TypedArray<u32>): BaseAttribute {
    const attribute = this;
    // TODO: We cant assume its float 32. But not sure what else to do here
    const array = this.getArray() as Float32Array;
    const itemSize = this.itemSize;
    const normalized = this.normalized;

    const array2 = array.slice(0);

    let index: i32 = 0,
      index2: i32 = 0;

    for (let i: i32 = 0, l = indices.length; i < l; i++) {
      const iattribute = attribute as InterleavedBufferAttribute;
      index = indices[i] * iattribute.data.stride + iattribute.offset;

      for (let j: i32 = 0; j < itemSize; j++) {
        array2[index2++] = array[index++];
      }
    }

    return new Float32BufferAttribute(array2, itemSize, normalized);
  }

  getUpdateRange(): UpdateRange | null {
    return null;
  }

  applyMatrix4(m: Matrix4): InterleavedBufferAttribute {
    for (let i = 0, l = this.data.count; i < l; i++) {
      _vector.x = this.getX(i);
      _vector.y = this.getY(i);
      _vector.z = this.getZ(i);

      _vector.applyMatrix4(m);

      this.setXYZ(i, _vector.x, _vector.y, _vector.z);
    }

    return this;
  }

  applyNormalMatrix(m: Matrix3): InterleavedBufferAttribute {
    for (let i = 0, l = this.count; i < l; i++) {
      _vector.x = this.getX(i);
      _vector.y = this.getY(i);
      _vector.z = this.getZ(i);

      _vector.applyNormalMatrix(m);

      this.setXYZ(i, _vector.x, _vector.y, _vector.z);
    }

    return this;
  }

  transformDirection(m: Matrix4): InterleavedBufferAttribute {
    for (let i = 0, l = this.count; i < l; i++) {
      _vector.x = this.getX(i);
      _vector.y = this.getY(i);
      _vector.z = this.getZ(i);

      _vector.transformDirection(m);

      this.setXYZ(i, _vector.x, _vector.y, _vector.z);
    }

    return this;
  }

  setX(index: u32, x: f32): InterleavedBufferAttribute {
    this.data.array[index * this.data.stride + this.offset] = x;

    return this;
  }

  setY(index: u32, y: f32): InterleavedBufferAttribute {
    this.data.array[index * this.data.stride + this.offset + 1] = y;

    return this;
  }

  setZ(index: u32, z: f32): InterleavedBufferAttribute {
    this.data.array[index * this.data.stride + this.offset + 2] = z;

    return this;
  }

  setW(index: u32, w: f32): InterleavedBufferAttribute {
    this.data.array[index * this.data.stride + this.offset + 3] = w;

    return this;
  }

  getX(index: u32): f32 {
    return this.data.array[index * this.data.stride + this.offset];
  }

  getY(index: u32): f32 {
    return this.data.array[index * this.data.stride + this.offset + 1];
  }

  getZ(index: u32): f32 {
    return this.data.array[index * this.data.stride + this.offset + 2];
  }

  getW(index: u32): f32 {
    return this.data.array[index * this.data.stride + this.offset + 3];
  }

  setXY(index: u32, x: f32, y: f32): InterleavedBufferAttribute {
    index = index * this.data.stride + this.offset;

    this.data.array[index + 0] = x;
    this.data.array[index + 1] = y;

    return this;
  }

  setXYZ(index: u32, x: f32, y: f32, z: f32): InterleavedBufferAttribute {
    index = index * this.data.stride + this.offset;

    this.data.array[index + 0] = x;
    this.data.array[index + 1] = y;
    this.data.array[index + 2] = z;

    return this;
  }

  setXYZW(index: u32, x: f32, y: f32, z: f32, w: f32): InterleavedBufferAttribute {
    index = index * this.data.stride + this.offset;

    this.data.array[index + 0] = x;
    this.data.array[index + 1] = y;
    this.data.array[index + 2] = z;
    this.data.array[index + 3] = w;

    return this;
  }

  // TODO:
  //   clone(data) {
  //     if (data === undefined) {
  //       console.log(
  //         "THREE.InterleavedBufferAttribute.clone(): Cloning an interlaved buffer attribute will deinterleave buffer data."
  //       );

  //       const array = [];

  //       for (let i = 0; i < this.count; i++) {
  //         const index = i * this.data.stride + this.offset;

  //         for (let j = 0; j < this.itemSize; j++) {
  //           array.push(this.data.array[index + j]);
  //         }
  //       }

  //       return new BufferAttribute(new this.array.constructor(array), this.itemSize, this.normalized);
  //     } else {
  //       if (data.interleavedBuffers === undefined) {
  //         data.interleavedBuffers = {};
  //       }

  //       if (data.interleavedBuffers[this.data.uuid] === undefined) {
  //         data.interleavedBuffers[this.data.uuid] = this.data.clone(data);
  //       }

  //       return new InterleavedBufferAttribute(
  //         data.interleavedBuffers[this.data.uuid],
  //         this.itemSize,
  //         this.offset,
  //         this.normalized
  //       );
  //     }
  //   }

  // toJSON( data ) {

  // 	if ( data === undefined ) {

  // 		console.log( 'THREE.InterleavedBufferAttribute.toJSON(): Serializing an interlaved buffer attribute will deinterleave buffer data.' );

  // 		const array = [];

  // 		for ( let i = 0; i < this.count; i ++ ) {

  // 			const index = i * this.data.stride + this.offset;

  // 			for ( let j = 0; j < this.itemSize; j ++ ) {

  // 				array.push( this.data.array[ index + j ] );

  // 			}

  // 		}

  // 		// deinterleave data and save it as an ordinary buffer attribute for now

  // 		return {
  // 			itemSize: this.itemSize,
  // 			type: this.array.constructor.name,
  // 			array: array,
  // 			normalized: this.normalized
  // 		};

  // 	} else {

  // 		// save as true interlaved attribtue

  // 		if ( data.interleavedBuffers === undefined ) {

  // 			data.interleavedBuffers = {};

  // 		}

  // 		if ( data.interleavedBuffers[ this.data.uuid ] === undefined ) {

  // 			data.interleavedBuffers[ this.data.uuid ] = this.data.toJSON( data );

  // 		}

  // 		return {
  // 			isInterleavedBufferAttribute: true,
  // 			itemSize: this.itemSize,
  // 			data: this.data.uuid,
  // 			offset: this.offset,
  // 			normalized: this.normalized
  // 		};

  // 	}

  // }
}
