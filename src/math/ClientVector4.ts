import { Vector4 } from "rewild-common";
import { Attribute } from "../renderer/geometry/Geometry";

export class ClientVector4 extends Vector4 {
  constructor(x: f32 = 0, y: f32 = 0, z: f32 = 0, w: f32 = 1) {
    super(x, y, z, w);
  }

  clone(): ClientVector4 {
    return new ClientVector4(this.x, this.y, this.z, this.w);
  }

  fromBufferAttribute(attribute: Attribute<Float32Array>, index: u32): ClientVector4 {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    this.z = attribute.getZ(index);
    this.w = attribute.getW(index);

    return this;
  }
}
