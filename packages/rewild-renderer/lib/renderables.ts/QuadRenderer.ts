import { IRenderable } from '../../types/interfaces';
import { Renderer } from '../Renderer';
import shader from '../shaders/texture-quad.wgsl';
import { samplerManager } from '../textures/SamplerManager';
import { textureManager } from '../textures/TextureManager';

export class QuadRenderer implements IRenderable {
  bindGroup: GPUBindGroup;
  texture: GPUTexture;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array;

  async initialize(renderer: Renderer) {
    const { device, presentationFormat } = renderer;

    const module = device.createShaderModule({
      code: shader,
    });

    const texture = textureManager.get('f-data');
    const sampler = samplerManager.get('nearest-simple');
    this.texture = texture.gpuTexture;

    const pipeline = device.createRenderPipeline({
      label: 'hardcoded textured quad pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: [{ format: presentationFormat }],
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less',
      },
      multisample: {
        count: renderer.sampleCount,
      },
    });

    // create a buffer for the uniform values
    const uniformBufferSize =
      2 * 4 + // scale is 2 32bit floats (4bytes each)
      2 * 4; // offset is 2 32bit floats (4bytes each)

    this.uniformBuffer = device.createBuffer({
      label: 'uniforms for quad',
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // create a typedarray to hold the values for the uniforms in JavaScript
    this.uniformValues = new Float32Array(uniformBufferSize / 4);

    this.bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: this.texture.createView() },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });

    this.pipeline = pipeline;
    return this;
  }

  update(): void {}

  render(renderer: Renderer, pass: GPURenderPassEncoder) {
    const { device } = renderer;

    // offsets to the various uniform values in float32 indices
    const kScaleOffset = 0;
    const kOffsetOffset = 2;

    // compute a scale that will draw our 0 to 1 clip space quad
    // 2x2 pixels in the canvas.
    const scaleX = 0.1; // canvas.width * 0.1;
    const scaleY = 0.1; // canvas.height * 0.1;

    this.uniformValues.set([scaleX, scaleY], kScaleOffset); // set the scale
    this.uniformValues.set(
      [0.5 + Math.sin(0.01 * 0.25) * 0.1, 0.5 + -0.1],
      kOffsetOffset
    ); // set the offset

    // copy the values from JavaScript to the GPU
    device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformValues);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6);
  }
}
