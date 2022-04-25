import { GPUBufferUsageFlags } from "../../common/GPUEnums";
import { Float32BufferAttribute } from "../core/BufferAttribute";
import { BufferGeometry } from "../core/BufferGeometry";
import { Event } from "../core/Event";
import { Listener } from "../core/EventDispatcher";
import { InstancedBufferGeometry } from "../core/InstancedBufferGeometry";
import { createBufferFromF32, createIndexBuffer } from "../Imports";
import { AttributeType } from "../../common/AttributeType";

export class AttributeMap {
  attributeBuffers: Map<AttributeType, i32>;
  indexBuffer: i32;

  constructor() {
    this.attributeBuffers = new Map<AttributeType, i32>();
    this.indexBuffer = -1;
  }
}

export class WebGPUGeometries implements Listener {
  private geometries: Map<i32, AttributeMap>;

  constructor() {
    this.geometries = new Map();
  }

  onEvent(event: Event): void {
    const geometry = event.target as BufferGeometry;

    geometry.removeEventListener("dispose", this);

    this.geometries.delete(geometry.id);

    if (geometry instanceof InstancedBufferGeometry) {
      (geometry as InstancedBufferGeometry)._maxInstanceCount = -1;
    }
  }

  get(geometry: BufferGeometry): AttributeMap | null {
    const geometries = this.geometries;

    if (geometries.has(geometry.id)) return geometries.get(geometry.id);
    return null;
  }

  set(geometry: BufferGeometry): BufferGeometry {
    const geometries = this.geometries;

    if (!geometries.has(geometry.id)) {
      geometry.addEventListener("dispose", this);

      const attributeMap = new AttributeMap();

      geometries.set(geometry.id, attributeMap);

      const posBuffer = geometry.getAttribute<Float32BufferAttribute>(AttributeType.POSITION);
      const normBuffer = geometry.getAttribute<Float32BufferAttribute>(AttributeType.NORMAL);
      const uvBuffer = geometry.getAttribute<Float32BufferAttribute>(AttributeType.UV);
      const indexBuffer = geometry.getIndexes();

      if (posBuffer) {
        attributeMap.attributeBuffers.set(
          AttributeType.POSITION,
          createBufferFromF32(posBuffer.array, GPUBufferUsageFlags.COPY_DST | GPUBufferUsageFlags.VERTEX)
        );
      }

      if (normBuffer) {
        attributeMap.attributeBuffers.set(
          AttributeType.NORMAL,
          createBufferFromF32(normBuffer.array, GPUBufferUsageFlags.COPY_DST | GPUBufferUsageFlags.VERTEX)
        );
      }

      if (uvBuffer) {
        attributeMap.attributeBuffers.set(
          AttributeType.UV,
          createBufferFromF32(uvBuffer.array, GPUBufferUsageFlags.COPY_DST | GPUBufferUsageFlags.VERTEX)
        );
      }

      if (indexBuffer) {
        attributeMap.indexBuffer = createIndexBuffer(
          indexBuffer.array,
          GPUBufferUsageFlags.COPY_DST | GPUBufferUsageFlags.INDEX
        );
      }
    }

    return geometry;
  }

  update(geometry: BufferGeometry): void {}
}
