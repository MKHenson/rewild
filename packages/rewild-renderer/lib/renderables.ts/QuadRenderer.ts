import { IRenderable } from '../../types/interfaces';
import { Renderer } from '../Renderer';
import shader from '../shaders/texture-quad.wgsl';

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

    const kTextureWidth = 5;
    const kTextureHeight = 7;
    const _ = [255, 0, 0, 255]; // red
    const y = [255, 255, 0, 255]; // yellow
    const b = [0, 0, 255, 255]; // blue

    // Disable prettier for this array as it's easier to read this way
    // prettier-ignore
    const textureData = new Uint8Array([
      b, _, _, _, _,
      _, y, y, y, _,
      _, y, _, _, _,
      _, y, y, _, _,
      _, y, _, _, _,
      _, y, _, _, _,
      _, _, _, _, _,
    ].flat());

    this.texture = device.createTexture({
      size: [kTextureWidth, kTextureHeight],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    device.queue.writeTexture(
      { texture: this.texture },
      textureData,
      { bytesPerRow: kTextureWidth * 4 },
      { width: kTextureWidth, height: kTextureHeight }
    );

    const sampler = device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'nearest',
      minFilter: 'nearest',
    });

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
