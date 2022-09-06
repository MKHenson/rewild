import { Vector2 } from "../../common/math/Vector2";
import { BufferAttribute } from "../core/BufferAttribute";

export class EngineVector2 extends Vector2 {
  clone(): EngineVector2 {
    return new EngineVector2(this.x, this.y);
  }

  fromBufferAttribute(attribute: BufferAttribute<f32, Float32Array>, index: u32): EngineVector2 {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);

    return this;
  }
}
