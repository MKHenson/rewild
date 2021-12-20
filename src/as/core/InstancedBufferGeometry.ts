import { BufferGeometry } from "./BufferGeometry";

export class InstancedBufferGeometry extends BufferGeometry {
  instanceCount: i32;
  _maxInstanceCount: i32;

  constructor() {
    super();

    this.type = "InstancedBufferGeometry";
    this.instanceCount = Infinity;
    this._maxInstanceCount = -1;
  }

  copy(source: InstancedBufferGeometry): InstancedBufferGeometry {
    super.copy(source);

    this.instanceCount = source.instanceCount;

    return this;
  }

  clone(): InstancedBufferGeometry {
    return new InstancedBufferGeometry().copy(this);
  }

  // TODO:
  // toJSON() {

  // 	const data = super.toJSON( this );

  // 	data.instanceCount = this.instanceCount;

  // 	data.isInstancedBufferGeometry = true;

  // 	return data;

  // }
}
