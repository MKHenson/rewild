import { Vector3 } from 'rewild-common';

export class GeometryGroup {
  public start: i32;
  public count: i32;
  public materialIndex: i32;
}

const _vector: Vector3 = new Vector3();

export class Geometry {
  requiresBuild: boolean = true;
  vertices: Float32Array;
  indices?: Uint16Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  groups: GeometryGroup[];

  vertexBuffer: GPUBuffer;
  normalBuffer: GPUBuffer;
  uvBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;

  constructor() {
    this.groups = [];
    this.requiresBuild = true;
  }

  dispose() {
    this.vertexBuffer?.destroy();
    this.normalBuffer?.destroy();
    this.uvBuffer?.destroy();
    this.indexBuffer?.destroy();
  }

  build(device: GPUDevice) {
    this.vertexBuffer = device.createBuffer({
      size: this.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(this.vertices);
    this.vertexBuffer.unmap();

    if (this.normals) {
      this.normalBuffer = device.createBuffer({
        label: 'normal buffer data',
        size: this.normals.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
      });
      new Float32Array(this.normalBuffer.getMappedRange()).set(this.normals);
      this.normalBuffer.unmap();
    }

    if (this.uvs) {
      this.uvBuffer = device.createBuffer({
        label: 'uv buffer data',
        size: this.uvs.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
      });
      new Float32Array(this.uvBuffer.getMappedRange()).set(this.uvs);
      this.uvBuffer.unmap();
    }

    if (this.indices) {
      this.indexBuffer = device.createBuffer({
        label: 'index buffer data',
        size: this.indices.byteLength,
        usage: GPUBufferUsage.INDEX,
        mappedAtCreation: true,
      });
      new Uint16Array(this.indexBuffer.getMappedRange()).set(this.indices);
      this.indexBuffer.unmap();
    }

    this.requiresBuild = false;
  }

  getGPUVertexBufferLayouts(): GPUVertexBufferLayout[] {
    return [
      {
        arrayStride: 3 * 4,
        stepMode: 'vertex',
        attributes: [
          {
            format: 'float32x3',
            offset: 0,
            shaderLocation: 0,
          },
        ],
      },
    ];
  }

  normalizeNormals(): void {
    const normals = this.normals;
    if (!normals) return;

    for (let i = 0; i < normals.length; i += 3) {
      _vector.set(normals[i], normals[i + 1], normals[i + 2]);
      _vector.normalize();
      normals[i] = _vector.x;
      normals[i + 1] = _vector.y;
      normals[i + 2] = _vector.z;
    }
  }

  computeNormals(): void {
    const indices = this.indices;
    const vertices = this.vertices;

    if (vertices) {
      if (!this.normals) {
        this.normals = new Float32Array(vertices.length);
      } else {
        this.normals.fill(0);
      }

      const pA = new Vector3();
      const pB = new Vector3();
      const pC = new Vector3();
      const nA = new Vector3();
      const nB = new Vector3();
      const nC = new Vector3();
      const cB = new Vector3();
      const aB = new Vector3();

      if (indices) {
        for (let i = 0; i < indices.length; i += 3) {
          const vA = indices[i];
          const vB = indices[i + 1];
          const vC = indices[i + 2];

          pA.fromBuffer(vA * 3, vertices);
          pB.fromBuffer(vB * 3, vertices);
          pC.fromBuffer(vC * 3, vertices);

          cB.subVectors(pC, pB);
          aB.subVectors(pA, pB);
          cB.cross(aB);

          nA.fromBuffer(vA * 3, this.normals);
          nB.fromBuffer(vB * 3, this.normals);
          nC.fromBuffer(vC * 3, this.normals);

          nA.add(cB);
          nB.add(cB);
          nC.add(cB);

          this.normals.set([nA.x, nA.y, nA.z], vA * 3);
          this.normals.set([nB.x, nB.y, nB.z], vB * 3);
          this.normals.set([nC.x, nC.y, nC.z], vC * 3);
        }
      } else {
        for (let i = 0; i < vertices.length; i += 9) {
          pA.fromBuffer(i, vertices);
          pB.fromBuffer(i + 3, vertices);
          pC.fromBuffer(i + 6, vertices);

          cB.subVectors(pC, pB);
          aB.subVectors(pA, pB);
          cB.cross(aB);

          this.normals.set([cB.x, cB.y, cB.z], i);
          this.normals.set([cB.x, cB.y, cB.z], i + 3);
          this.normals.set([cB.x, cB.y, cB.z], i + 6);
        }
      }
    }

    this.normalizeNormals();
    this.requiresBuild = true;
  }
}
