import { AttributeType } from "../../../common/AttributeType";

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

export class Attribute<T extends ArrayBuffer> {
  itemSize: number;
  version: number;
  normalized: boolean;
  buffer: T;

  constructor(buffer: T, itemSize: number, normalized = false) {
    this.itemSize = itemSize;
    this.normalized = normalized;
    this.buffer = buffer;
  }
}

export class Geometry {
  name: string;
  bufferGeometry: Number;
  attributes: Map<AttributeType, Attribute<ArrayBuffer>>;
  indices: Uint32Array | Uint16Array;
  groups: BufferGeometryGroup[];

  constructor() {
    this.name = "";
    this.attributes = new Map();
    this.groups = [];
  }

  setAttribute(type: AttributeType, buffer: ArrayBuffer, itemSize: number) {
    this.attributes.set(type, new Attribute(buffer, itemSize));
  }

  setIndexes(buffer: number[]) {
    this.indices = arrayMax(buffer) > 65535 ? new Uint32Array(buffer) : new Uint16Array(buffer);
  }

  addGroup(start: i32, count: i32, materialIndex: i32 = 0): void {
    this.groups.push(new BufferGeometryGroup(start, count, materialIndex));
  }

  clearGroups(): void {
    this.groups = [];
  }
}

function arrayMax(array: number[]) {
  if (array.length === 0) return -Infinity;

  let max = array[0];

  for (let i = 1, l = array.length; i < l; ++i) {
    if (array[i] > max) max = array[i];
  }

  return max;
}
