import { GPUBufferUsageFlags } from "../../../common/GPUEnums";
import { Float32BufferAttribute } from "../../core/BufferAttribute";
import { AttributeTypes, BufferGeometry } from "../../core/BufferGeometry";
import { Event } from "../../core/Event";
import { Listener } from "../../core/EventDispatcher";
import { InstancedBufferGeometry } from "../../core/InstancedBufferGeometry";
import { createBufferFromF32, createIndexBuffer } from "../../Imports";

export class AttributeMap {
  attributeBuffers: Map<symbol, i32>;
  indexBuffer: i32;

  constructor() {
    this.attributeBuffers = new Map<symbol, i32>();
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

      const posBuffer = geometry.getAttribute<Float32BufferAttribute>(AttributeTypes.POSITION);
      const normBuffer = geometry.getAttribute<Float32BufferAttribute>(AttributeTypes.NORMAL);
      const uvBuffer = geometry.getAttribute<Float32BufferAttribute>(AttributeTypes.UV);
      const indexBuffer = geometry.getIndexes();

      if (posBuffer) {
        attributeMap.attributeBuffers.set(
          AttributeTypes.POSITION,
          createBufferFromF32(posBuffer.array, GPUBufferUsageFlags.COPY_DST | GPUBufferUsageFlags.VERTEX)
        );
      }

      if (normBuffer) {
        attributeMap.attributeBuffers.set(
          AttributeTypes.NORMAL,
          createBufferFromF32(normBuffer.array, GPUBufferUsageFlags.COPY_DST | GPUBufferUsageFlags.VERTEX)
        );
      }

      if (uvBuffer) {
        attributeMap.attributeBuffers.set(
          AttributeTypes.UV,
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
