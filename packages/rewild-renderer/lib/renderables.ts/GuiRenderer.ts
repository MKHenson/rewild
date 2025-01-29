import { IRenderable } from '../../types/interfaces';
import { Renderer } from '../Renderer';
import guiShader from '../shaders/gui.wgsl';

function createFVertices() {
  // prettier-ignore
  const vertexData = new Float32Array([
    0, 0,
    1, 0,
    0, 1,
    1, 1,
  ]);

  // prettier-ignore
  const indexData = new Uint32Array([
    0,  1,  2,    2,  1,  3
  ]);

  return {
    vertexData,
    indexData,
    numVertices: indexData.length,
  };
}

export class GuiRenderer implements IRenderable {
  bindGroup: GPUBindGroup;
  numVertices: number;
  vertexBuffer: GPUBuffer;
  instanceBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array;
  resolutionValue: Float32Array;
  prevNumElements: i32;

  elements: {
    x: f32;
    y: f32;
    width: f32;
    height: f32;
  }[];

  async initialize(renderer: Renderer) {
    const { device, presentationFormat, pane } = renderer;
    this.prevNumElements = 0;

    pane.canvas()!.addEventListener('click', () => {
      this.elements.push({
        x: Math.random() * 800,
        y: Math.random() * 800,
        width: Math.random() * 500,
        height: Math.random() * 300,
      });
    });

    this.elements = [
      {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
      {
        x: 500,
        y: 700,
        width: 50,
        height: 40,
      },
    ];

    const module = device.createShaderModule({
      code: guiShader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'gui pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
        buffers: [
          {
            arrayStride: 2 * 4, // (2) floats, 4 bytes each
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
            ],
          },
          {
            arrayStride: 4 * 4, // (4) floats, 4 bytes each
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x2' }, // offset
              { shaderLocation: 2, offset: 8, format: 'float32x2' }, // size
            ],
          },
        ],
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      multisample: {
        count: renderer.sampleCount,
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less',
      },
    });

    // resolution size of the canvas stored as a vec2
    const uniformBufferSize = 2 * 4;
    this.uniformBuffer = device.createBuffer({
      label: 'uniforms',
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.uniformValues = new Float32Array(uniformBufferSize / 4);
    this.resolutionValue = this.uniformValues.subarray(0, 2);

    this.bindGroup = device.createBindGroup({
      label: 'bind group for object',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    // Set up the vertex and index buffers for the quad
    const { vertexData, indexData, numVertices } = createFVertices();
    this.numVertices = numVertices;

    this.vertexBuffer = device.createBuffer({
      label: 'vertex buffer vertices',
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.vertexBuffer, 0, vertexData);

    this.indexBuffer = device.createBuffer({
      label: 'index buffer',
      size: indexData.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.indexBuffer, 0, indexData);

    // Now create the buffers for the element data
    const elementData = new Float32Array(this.elements.length * 4);
    for (let i = 0; i < this.elements.length; i++) {
      const element = this.elements[i];
      elementData.set(
        [element.x, element.y, element.width, element.height],
        i * 4
      );
    }

    this.instanceBuffer = device.createBuffer({
      label: 'element buffer',
      size: elementData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.instanceBuffer, 0, elementData);

    return this;
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder) {
    const { device, pane } = renderer;
    const canvas = pane.canvas()!;

    if (this.elements.length !== this.prevNumElements) {
      const elementData = new Float32Array(this.elements.length * 4);
      for (let i = 0; i < this.elements.length; i++) {
        const element = this.elements[i];
        elementData.set(
          [element.x, element.y, element.width, element.height],
          i * 4
        );
      }
      this.instanceBuffer.destroy();
      this.instanceBuffer = device.createBuffer({
        label: 'element buffer',
        size: elementData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });

      device.queue.writeBuffer(this.instanceBuffer, 0, elementData);
      this.prevNumElements = this.elements.length;
    }

    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint32');

    // Set the uniform values in our JavaScript side Float32Array
    this.resolutionValue.set([canvas.width, canvas.height]);

    // upload the uniform values to the uniform buffer
    device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformValues);

    pass.setBindGroup(0, this.bindGroup);
    pass.drawIndexed(this.numVertices, this.elements.length);
  }
}
