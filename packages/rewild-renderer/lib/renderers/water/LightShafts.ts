import { Renderer } from '../../Renderer';
import shader from '../../shaders/sky/lightShafts.wgsl';
import vertexScreenQuadShader from '../../shaders/utils/vertexScreenQuad.wgsl';
import type { Caustics } from './Caustics';

const FORMAT: GPUTextureFormat = 'rgba16float';

/**
 * Light shafts under water (lightShafts.wgsl): a half-resolution pass marches
 * each view ray through the caustics, before the atmosphere composite, and a
 * full-screen draw in the composite's pass adds them over the water's fog,
 * upsampled by depth.
 */
export class LightShafts {
  /** Scale on the shafts; 1 is the physical answer. */
  strength = 1;
  private target: GPUTexture | null = null;
  private marchPipeline: GPURenderPipeline | null = null;
  private compositePipeline: GPURenderPipeline | null = null;
  private marchGroup: GPUBindGroup | null = null;
  private compositeGroup: GPUBindGroup | null = null;
  private params: GPUBuffer | null = null;
  private data = new Float32Array(4);
  private frame = 0;
  private marched = false;
  // What the groups were built against; a resize or a new sky replaces them.
  private boundDepth: GPUTexture | null = null;
  private boundAtmosphere: GPUBuffer | null = null;

  /**
   * Marches the shafts into the half-resolution target. Encode it before the
   * atmosphere composite's pass, and draw them with `composite` inside it.
   * `underWater` is the UnderWater uniform.
   */
  march(
    renderer: Renderer,
    encoder: GPUCommandEncoder,
    underWater: GPUBuffer,
    caustics: Caustics,
    timestamps?: GPURenderPassTimestampWrites
  ): void {
    this.marched = false;
    const atmosphere = renderer.sky?.skyRenderer?.finalPass?.uniformBuffer;
    if (!atmosphere) return;
    const { device } = renderer;
    if (!this.marchPipeline || !this.compositePipeline)
      this.createPipelines(renderer);
    if (!this.params)
      this.params = device.createBuffer({
        label: 'light shafts',
        size: this.data.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    if (
      !this.marchGroup ||
      this.boundDepth !== renderer.depthTexture ||
      this.boundAtmosphere !== atmosphere
    )
      this.createGroups(renderer, underWater, caustics, atmosphere);

    this.frame = (this.frame + 1) % 64;
    this.data[0] = this.frame;
    this.data[1] = this.strength;
    device.queue.writeBuffer(this.params, 0, this.data);

    const pass = encoder.beginRenderPass({
      label: 'light shafts',
      colorAttachments: [
        {
          view: this.target!.createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      timestampWrites: timestamps,
    });
    pass.setPipeline(this.marchPipeline!);
    pass.setBindGroup(0, this.marchGroup!);
    pass.draw(6);
    pass.end();
    this.marched = true;
  }

  /** Marks this frame as having no shafts. */
  skip(): void {
    this.marched = false;
  }

  /** Adds this frame's shafts into `pass`, the composite's, after the fog. */
  composite(pass: GPURenderPassEncoder): void {
    if (!this.marched) return;
    pass.setPipeline(this.compositePipeline!);
    pass.setBindGroup(0, this.compositeGroup!);
    pass.draw(6);
  }

  private createPipelines(renderer: Renderer) {
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({
      label: 'light shafts',
      code: shader,
    });
    const vertex = {
      module: device.createShaderModule({ code: vertexScreenQuadShader }),
      entryPoint: 'vs',
    };
    this.marchPipeline = device.createRenderPipeline({
      label: 'light shafts march',
      layout: 'auto',
      vertex,
      fragment: {
        module,
        entryPoint: 'fs_march',
        targets: [{ format: FORMAT }],
      },
    });
    this.compositePipeline = device.createRenderPipeline({
      label: 'light shafts composite',
      layout: 'auto',
      vertex,
      fragment: {
        module,
        entryPoint: 'fs_composite',
        targets: [
          {
            format: sceneColorFormat,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one' },
              alpha: { srcFactor: 'zero', dstFactor: 'one' },
            },
          },
        ],
      },
    });
  }

  private createGroups(
    renderer: Renderer,
    underWater: GPUBuffer,
    caustics: Caustics,
    atmosphere: GPUBuffer
  ) {
    const { device } = renderer;
    const depth = renderer.depthTexture;
    this.boundDepth = depth;
    this.boundAtmosphere = atmosphere;
    this.target?.destroy();
    this.target = device.createTexture({
      label: 'light shafts',
      size: [Math.ceil(depth.width / 2), Math.ceil(depth.height / 2)],
      format: FORMAT,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    const depthView = depth.createView({ aspect: 'depth-only' });
    this.marchGroup = device.createBindGroup({
      label: 'light shafts march',
      layout: this.marchPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: atmosphere } },
        { binding: 1, resource: depthView },
        { binding: 2, resource: { buffer: underWater } },
        { binding: 3, resource: caustics.texture(device).createView() },
        { binding: 4, resource: caustics.sampler(device) },
        { binding: 5, resource: { buffer: caustics.buffer(device) } },
        { binding: 6, resource: { buffer: this.params! } },
      ],
    });
    this.compositeGroup = device.createBindGroup({
      label: 'light shafts composite',
      layout: this.compositePipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: atmosphere } },
        { binding: 1, resource: depthView },
        { binding: 2, resource: { buffer: underWater } },
        { binding: 7, resource: this.target.createView() },
      ],
    });
  }

  dispose(): void {
    this.target?.destroy();
    this.params?.destroy();
    this.target = null;
    this.params = null;
    this.marchGroup = null;
    this.compositeGroup = null;
    this.boundDepth = null;
    this.boundAtmosphere = null;
  }
}
