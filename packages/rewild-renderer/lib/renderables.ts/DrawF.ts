import { IRenderable } from '../../types/interfaces';
import { Renderer } from '../Renderer';
import fShader from '../shaders/f-shader.wgsl';

function createFVertices() {
  // prettier-ignore
  const vertexData = new Float32Array([
    // left column
    0, 0,
    30, 0,
    0, 150,
    30, 150,
 
    // top rung
    30, 0,
    100, 0,
    30, 30,
    100, 30,
 
    // middle rung
    30, 60,
    70, 60,
    30, 90,
    70, 90,
  ]);

  // prettier-ignore
  const indexData = new Uint32Array([
    0,  1,  2,    2,  1,  3,  // left column
    4,  5,  6,    6,  5,  7,  // top run
    8,  9, 10,   10,  9, 11,  // middle run
  ]);

  return {
    vertexData,
    indexData,
    numVertices: indexData.length,
  };
}

export class DrawF implements IRenderable {
  bindGroup: GPUBindGroup;
  numVertices: number;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array;
  colorValue: Float32Array;
  resolutionValue: Float32Array;
  translationValue: Float32Array;

  async initialize(renderer: Renderer) {
    const { device, presentationFormat } = renderer;

    const module = device.createShaderModule({
      code: fShader,
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
        ],
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: [
          {
            format: presentationFormat,
          },
        ],
      },
      multisample: {
        count: renderer.sampleCount,
      },
    });

    // color, resolution, translation
    const uniformBufferSize = (4 + 2 + 2) * 4;
    this.uniformBuffer = device.createBuffer({
      label: 'uniforms',
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.uniformValues = new Float32Array(uniformBufferSize / 4);

    // offsets to the various uniform values in float32 indices
    const kColorOffset = 0;
    const kResolutionOffset = 4;
    const kTranslationOffset = 6;

    this.colorValue = this.uniformValues.subarray(
      kColorOffset,
      kColorOffset + 4
    );
    this.resolutionValue = this.uniformValues.subarray(
      kResolutionOffset,
      kResolutionOffset + 2
    );
    this.translationValue = this.uniformValues.subarray(
      kTranslationOffset,
      kTranslationOffset + 2
    );

    // The color will not change so let's set it once at init time
    this.colorValue.set([Math.random(), Math.random(), Math.random(), 1]);

    // Set up the vertex and index buffers
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

    this.bindGroup = device.createBindGroup({
      label: 'bind group for object',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    return this;
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder) {
    const { device, pane } = renderer;
    const canvas = pane.canvas()!;

    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint32');

    // Set the uniform values in our JavaScript side Float32Array
    this.resolutionValue.set([canvas.width, canvas.height]);
    this.translationValue.set([0, 0]);

    // upload the uniform values to the uniform buffer
    device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformValues);

    pass.setBindGroup(0, this.bindGroup);
    pass.drawIndexed(this.numVertices);
  }
}
