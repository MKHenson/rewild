import { wasm } from "../../core/WasmManager";
import { AttributeType } from "../../../common/AttributeType";
import { createBufferFromF32, createIndexBufferU32 } from "../../core/Utils";
import { Renderer } from "../Renderer";

export class BufferGeometryGroup {
  start: i32;
  count: i32;
  materialIndex: i32;

  constructor(start: i32, count: i32, materialIndex: i32 = 0) {
    this.start = start;
    this.count = count;
    this.materialIndex = materialIndex;
  }
}

export type BufferArray = ArrayBuffer & { [index: number]: number };

export class Attribute<T extends BufferArray> {
  itemSize: number;
  version: number;
  normalized: boolean;
  buffer: T;
  gpuBuffer: GPUBuffer | null;

  constructor(buffer: T, itemSize: number, normalized = false) {
    this.itemSize = itemSize;
    this.normalized = normalized;
    this.buffer = buffer;
    this.gpuBuffer = null;
  }

  getX(index: u32): number {
    return this.buffer[index * this.itemSize];
  }

  setX(index: u32, x: number) {
    this.buffer[index * this.itemSize] = x;

    return this;
  }

  getY(index: u32) {
    return this.buffer[index * this.itemSize + 1];
  }

  setY(index: u32, y: number) {
    this.buffer[index * this.itemSize + 1] = y;

    return this;
  }

  getZ(index: u32) {
    return this.buffer[index * this.itemSize + 2];
  }

  setZ(index: u32, z: number) {
    this.buffer[index * this.itemSize + 2] = z;

    return this;
  }

  getW(index: u32) {
    return this.buffer[index * this.itemSize + 3];
  }

  setW(index: u32, w: number) {
    this.buffer[index * this.itemSize + 3] = w;

    return this;
  }

  setXY(index: u32, x: number, y: number) {
    index *= this.itemSize;

    this.buffer[index + 0] = x;
    this.buffer[index + 1] = y;

    return this;
  }

  setXYZ(index: u32, x: number, y: number, z: number) {
    index *= this.itemSize;

    this.buffer[index + 0] = x;
    this.buffer[index + 1] = y;
    this.buffer[index + 2] = z;

    return this;
  }

  setXYZW(index: u32, x: number, y: number, z: number, w: number) {
    index *= this.itemSize;

    this.buffer[index + 0] = x;
    this.buffer[index + 1] = y;
    this.buffer[index + 2] = z;
    this.buffer[index + 3] = w;

    return this;
  }
}

export class Geometry {
  name: string;
  bufferGeometry: Number;
  attributes: Map<AttributeType, Attribute<BufferArray>>;
  indices: Uint32Array;
  groups: BufferGeometryGroup[];
  requiresBuild: boolean;

  indexBuffer: GPUBuffer | null;

  constructor() {
    this.name = "";
    this.attributes = new Map();
    this.groups = [];
    this.bufferGeometry = wasm.creatBufferGeometry();
    this.requiresBuild = true;
    this.indexBuffer = null;
  }

  build(renderer: Renderer) {
    this.requiresBuild = false;
    this.attributes.forEach((value, key) => {
      if (
        key === AttributeType.NORMAL ||
        key === AttributeType.POSITION ||
        key === AttributeType.UV ||
        key === AttributeType.TANGENT
      ) {
        const buffer = createBufferFromF32(
          renderer.device,
          value.buffer as Float32Array,
          GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        );
        value.gpuBuffer = buffer;
      } else throw new Error(`Attribute ${AttributeType[key]} not recognised`);
    });

    this.indexBuffer = createIndexBufferU32(renderer.device, this.indices);
    return this;
  }

  setAttribute(
    type: AttributeType,
    buffer: BufferArray | Attribute<BufferArray>,
    itemSize?: number,
    normalized = false
  ) {
    let attribute: Attribute<BufferArray>;

    if (buffer instanceof Attribute) attribute = buffer;
    else attribute = new Attribute(buffer, itemSize!, normalized);

    this.attributes.set(type, attribute);
    if (buffer instanceof Float32Array) {
      const wasmAttribute = wasm.createBufferAttributeF32(buffer, attribute.itemSize, attribute.normalized);
      wasm.setBufferAttribute(this.bufferGeometry as any, type, wasmAttribute);
    }
  }

  setIndexes(buffer: number[]) {
    this.indices = new Uint32Array(buffer);
    const wasmAttribute = wasm.createBufferAttributeu32(this.indices, 1, false);
    wasm.setIndexAttribute(this.bufferGeometry as any, wasmAttribute);
  }

  addGroup(start: i32, count: i32, materialIndex: i32 = 0): void {
    this.groups.push(new BufferGeometryGroup(start, count, materialIndex));
  }

  clearGroups(): void {
    this.groups = [];
  }
}
