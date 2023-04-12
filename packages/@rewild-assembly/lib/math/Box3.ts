import { Box3 } from "@rewild/Common";
import { BufferAttribute } from "../core/BufferAttribute";

export class EngineBox3 extends Box3 {
  clone(): EngineBox3 {
    return new EngineBox3().copy(this) as EngineBox3;
  }

  setFromBufferAttribute(attribute: BufferAttribute<f32, Float32Array>): EngineBox3 {
    let minX: f32 = +Infinity;
    let minY: f32 = +Infinity;
    let minZ: f32 = +Infinity;

    let maxX: f32 = -Infinity;
    let maxY: f32 = -Infinity;
    let maxZ: f32 = -Infinity;

    for (let i: u32 = 0, l = attribute.count; i < l; i++) {
      const x: f32 = attribute.getX(i);
      const y: f32 = attribute.getY(i);
      const z: f32 = attribute.getZ(i);

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;

      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }

    this.min.set(minX, minY, minZ);
    this.max.set(maxX, maxY, maxZ);

    return this;
  }
}
