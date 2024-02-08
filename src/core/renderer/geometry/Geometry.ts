import { wasm } from 'rewild-wasmtime';
import { AttributeType } from 'rewild-common';
import { createBufferFromF32, createIndexBufferU32 } from '../../Utils';
import { Renderer } from '../Renderer';
import { ClientVector3 } from '../../../math/ClientVector3';

const _vector = new ClientVector3();

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

export type BufferArray = ArrayBuffer & {
  [index: number]: number;
  length: number;
};

export class Attribute<T extends BufferArray> {
  itemSize: number;
  count: number;
  version: number;
  normalized: boolean;
  buffer: T;
  gpuBuffer: GPUBuffer | null;

  constructor(buffer: T, itemSize: number, normalized = false) {
    this.itemSize = itemSize;
    this.count = buffer.length / itemSize;
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

const pA = new ClientVector3(),
  pB = new ClientVector3(),
  pC = new ClientVector3();
const nA = new ClientVector3(),
  nB = new ClientVector3(),
  nC = new ClientVector3();
const cb = new ClientVector3(),
  ab = new ClientVector3();

export class Geometry {
  name: string;
  bufferGeometry: Number;
  attributes: Map<AttributeType, Attribute<BufferArray>>;
  indices: Uint32Array;
  groups: BufferGeometryGroup[];
  requiresBuild: boolean;

  indexBuffer: GPUBuffer | null;

  constructor(name: string = '') {
    this.name = name;
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

    if (this.indices)
      this.indexBuffer = createIndexBufferU32(renderer.device, this.indices);
    return this;
  }

  setAttribute(
    type: AttributeType,
    buffer: BufferArray | Attribute<BufferArray>,
    itemSize?: number,
    normalized = false
  ): void {
    let attribute: Attribute<BufferArray>;

    if (buffer instanceof Attribute) attribute = buffer;
    else attribute = new Attribute(buffer, itemSize!, normalized);

    this.attributes.set(type, attribute);
    if (buffer instanceof Float32Array) {
      const wasmAttribute = wasm.createBufferAttributeF32(
        buffer,
        attribute.itemSize,
        attribute.normalized
      );
      wasm.setBufferAttribute(this.bufferGeometry as any, type, wasmAttribute);
    }
  }

  normalizeNormals(): void {
    const normalAttribute = this.attributes.get(
      AttributeType.NORMAL
    ) as Attribute<Float32Array>;
    if (!normalAttribute) throw new Error('No normal attribute defined');

    for (let i = 0, il = normalAttribute.count; i < il; i++) {
      _vector.fromBufferAttribute(normalAttribute, i);
      _vector.normalize();
      normalAttribute.setXYZ(i, _vector.x, _vector.y, _vector.z);
    }
  }

  computeVertexNormals(): void {
    const index = this.indices;
    const positionAttribute = this.attributes.get(
      AttributeType.POSITION
    ) as Attribute<Float32Array>;

    if (positionAttribute) {
      let normalAttribute = this.attributes.get(
        AttributeType.NORMAL
      ) as Attribute<Float32Array>;

      if (!normalAttribute) {
        normalAttribute = new Attribute(
          new Float32Array(positionAttribute.count * 3),
          3
        );
        this.setAttribute(AttributeType.NORMAL, normalAttribute);
      } else {
        // reset existing normals to zero
        for (let i = 0, il = normalAttribute.count; i < il; i++) {
          normalAttribute.setXYZ(i, 0, 0, 0);
        }
      }

      // indexed elements

      if (index) {
        for (let i = 0, il = index.length; i < il; i += 3) {
          const vA = index.at(i + 0)!;
          const vB = index.at(i + 1)!;
          const vC = index.at(i + 2)!;

          pA.fromBufferAttribute(positionAttribute, vA);
          pB.fromBufferAttribute(positionAttribute, vB);
          pC.fromBufferAttribute(positionAttribute, vC);

          cb.subVectors(pC, pB);
          ab.subVectors(pA, pB);
          cb.cross(ab);

          nA.fromBufferAttribute(normalAttribute, vA);
          nB.fromBufferAttribute(normalAttribute, vB);
          nC.fromBufferAttribute(normalAttribute, vC);

          nA.add(cb);
          nB.add(cb);
          nC.add(cb);

          normalAttribute.setXYZ(vA, nA.x, nA.y, nA.z);
          normalAttribute.setXYZ(vB, nB.x, nB.y, nB.z);
          normalAttribute.setXYZ(vC, nC.x, nC.y, nC.z);
        }
      } else {
        // non-indexed elements (unconnected triangle soup)

        for (let i = 0, il = positionAttribute.count; i < il; i += 3) {
          pA.fromBufferAttribute(positionAttribute, i + 0);
          pB.fromBufferAttribute(positionAttribute, i + 1);
          pC.fromBufferAttribute(positionAttribute, i + 2);

          cb.subVectors(pC, pB);
          ab.subVectors(pA, pB);
          cb.cross(ab);

          normalAttribute.setXYZ(i + 0, cb.x, cb.y, cb.z);
          normalAttribute.setXYZ(i + 1, cb.x, cb.y, cb.z);
          normalAttribute.setXYZ(i + 2, cb.x, cb.y, cb.z);
        }
      }

      this.normalizeNormals();
      normalAttribute.version++;
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
