import { BufferAttribute } from "./BufferAttribute";

export class InstancedBufferAttribute<K, T extends TypedArray<K>> extends BufferAttribute<K, T> {
  meshPerAttribute: i32;

  constructor(array: T, itemSize: i32, normalized: boolean = false, meshPerAttribute: i32 = 1) {
    super(array, itemSize, normalized);

    this.meshPerAttribute = meshPerAttribute;
  }

  copy(source: InstancedBufferAttribute<K, T>, array: T): InstancedBufferAttribute<K, T> {
    super.copy(source, array);

    this.meshPerAttribute = source.meshPerAttribute;

    return this;
  }

  // TODO:
  // toJSON() {

  // 	const data = super.toJSON();

  // 	data.meshPerAttribute = this.meshPerAttribute;

  // 	data.isInstancedBufferAttribute = true;

  // 	return data;

  // }
}
