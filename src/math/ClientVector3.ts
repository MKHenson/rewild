import { Attribute } from '../core/renderer/geometry/Geometry';
import { Vector3 } from 'rewild-common';

export class ClientVector3 extends Vector3 {
  constructor(x: f32 = 0, y: f32 = 0, z: f32 = 0) {
    super(x, y, z);
  }

  clone(): ClientVector3 {
    return new ClientVector3(this.x, this.y, this.z);
  }

  fromBufferAttribute(
    attribute: Attribute<Float32Array>,
    index: u32
  ): ClientVector3 {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    this.z = attribute.getZ(index);

    return this;
  }
}
