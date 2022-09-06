import { Vector4 } from "../../common/math/Vector4";
import { BufferAttribute } from "../core/BufferAttribute";

export class EngineVector4 extends Vector4 {
  constructor(x: f32 = 0, y: f32 = 0, z: f32 = 0, w: f32 = 1) {
    super(x, y, z, w);
  }

  clone(): EngineVector4 {
    return new EngineVector4(this.x, this.y, this.z, this.w);
  }

  fromBufferAttribute(attribute: BufferAttribute<f32, Float32Array>, index: u32): EngineVector4 {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    this.z = attribute.getZ(index);
    this.w = attribute.getW(index);

    return this;
  }
}
