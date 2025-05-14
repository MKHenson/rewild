export class GeometryGroup {
  public start: i32;
  public count: i32;
  public materialIndex: i32;
}

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
}
