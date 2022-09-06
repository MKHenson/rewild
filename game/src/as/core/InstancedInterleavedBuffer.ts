import { InterleavedBuffer } from "./InterleavedBuffer";

export class InstancedInterleavedBuffer extends InterleavedBuffer {
  meshPerAttribute: u32;

  constructor(array: Float32Array, stride: u32, meshPerAttribute: u32 = 1) {
    super(array, stride);

    this.meshPerAttribute = meshPerAttribute;
  }

  copy(source: InstancedInterleavedBuffer): InstancedInterleavedBuffer {
    super.copy(source);

    this.meshPerAttribute = source.meshPerAttribute;

    return this;
  }

  clone(): InstancedInterleavedBuffer {
    return this.copy(new InstancedInterleavedBuffer(this.array.slice(), this.stride, this.meshPerAttribute));
  }

  // TODO:
  // toJSON( data ) {

  // 	const json = super.toJSON( data );

  // 	json.isInstancedInterleavedBuffer = true;
  // 	json.meshPerAttribute = this.meshPerAttribute;

  // 	return json;

  // }
}
