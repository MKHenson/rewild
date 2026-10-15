import { Renderer } from '../../Renderer';
import { Camera } from '../../core/Camera';
import { composeShader } from '../../utils/shaderDefines';
import { aoConfig, aoShaderDefines } from './AoQuality';
import ssaoShader from '../../shaders/ao/ssao.wgsl';
import blurShader from '../../shaders/ao/ssao-blur.wgsl';
import resolveShader from '../../shaders/ao/ssao-resolve.wgsl';
import debugShader from '../../shaders/ao/ssao-debug.wgsl';

const AO_FORMAT: GPUTextureFormat = 'rg16float';

/** Which AO target `renderDebug` shows over the frame. */
export type AoDebugView = 'off' | 'raw' | 'blurred';

/**
 * Screen-space ambient occlusion on the sky ambient.
 *
 * Runs between the opaque scene pass and water: AO from the depth buffer at
 * half resolution, a depth-aware blur, then a resolve that subtracts the
 * occluded share of the scene's indirect target (scene-output.wgsl) from the
 * scene colour. Sunlight is never touched, and water and transparent meshes
 * draw after it, so neither is occluded.
 *
 *     renderer.ambientOcclusion.enabled = false; // A/B against no AO
 *     renderer.ambientOcclusion.debugView = 'blurred';
 */
export class AmbientOcclusion {
  /** Off leaves the frame as it was without AO; the tier can still turn it off. */
  enabled = true;
  /** Exponent on visibility. Above 1 darkens. */
  intensity = 1.8;
  /** Multiplier on the tier's radius. */
  radiusScale = 0.8;
  /**
   * Share of the AO that also darkens direct light, 0..1. 0 is ambient only;
   * above 0 brings contact darkening into sunlit areas the shadow maps miss.
   */
  directStrength = 0.5;
  debugView: AoDebugView = 'off';

  private builtRevision = -1;
  private samples = 0;
  private radius = 0;
  private fadeStart = 0;
  private fadeEnd = 0;
  private computedThisFrame = false;

  private aoPipeline: GPURenderPipeline | null = null;
  private blurPipeline: GPURenderPipeline | null = null;
  private resolvePipeline: GPURenderPipeline | null = null;
  private debugPipeline: GPURenderPipeline | null = null;
  private params: GPUBuffer | null = null;
  private paramsData = new Float32Array(40);

  private raw: GPUTexture | null = null;
  private blurred: GPUTexture | null = null;
  private rawView: GPUTextureView | null = null;
  private blurredView: GPUTextureView | null = null;
  private aoBindGroup: GPUBindGroup | null = null;
  private blurBindGroup: GPUBindGroup | null = null;
  private resolveBindGroup: GPUBindGroup | null = null;
  private rawDebugBindGroup: GPUBindGroup | null = null;
  private blurredDebugBindGroup: GPUBindGroup | null = null;
  private boundDepth: GPUTexture | null = null;
  private boundIndirect: GPUTexture | null = null;

  /** Whether this frame's resolve darkens the ambient. */
  applies(renderer: Renderer): boolean {
    return (
      this.enabled &&
      aoConfig(renderer.quality.aspect('ao')).samples > 0 &&
      renderer.materialDebugChannel === 0
    );
  }

  /**
   * Encode after the opaque scene pass ends and before anything reads its
   * colour. `indirect` is the scene's second colour target.
   */
  render(
    renderer: Renderer,
    encoder: GPUCommandEncoder,
    camera: Camera,
    depth: GPUTexture,
    indirect: GPUTexture,
    sceneColor: GPUTextureView
  ): void {
    const device = renderer.device;
    if (renderer.quality.hasChangedSince(this.builtRevision))
      this.build(renderer);

    const apply = this.applies(renderer);
    this.computedThisFrame =
      this.samples > 0 && (apply || this.debugView !== 'off');
    if (!this.computedThisFrame) return;

    this.prepareTargets(device, depth, indirect);

    const data = this.paramsData;
    data.set(camera.projectionMatrix.elements, 0);
    data.set(camera.projectionMatrixInverse.elements, 16);
    data[32] = this.radius * this.radiusScale;
    data[33] = this.intensity;
    data[34] = this.fadeStart;
    data[35] = this.fadeEnd;
    data[36] = this.directStrength;
    device.queue.writeBuffer(this.params!, 0, data);

    const timer = renderer.sceneGpuTimer;

    const aoPass = encoder.beginRenderPass({
      label: 'ssao',
      colorAttachments: [
        { view: this.rawView!, loadOp: 'clear', storeOp: 'store' },
      ],
      timestampWrites: timer.writes('ao'),
    });
    aoPass.setPipeline(this.aoPipeline!);
    aoPass.setBindGroup(0, this.aoBindGroup!);
    aoPass.draw(3);
    aoPass.end();

    const blurPass = encoder.beginRenderPass({
      label: 'ssao blur',
      colorAttachments: [
        { view: this.blurredView!, loadOp: 'clear', storeOp: 'store' },
      ],
      timestampWrites: timer.writes('ao blur'),
    });
    blurPass.setPipeline(this.blurPipeline!);
    blurPass.setBindGroup(0, this.blurBindGroup!);
    blurPass.draw(3);
    blurPass.end();

    if (!apply) return;

    const resolvePass = encoder.beginRenderPass({
      label: 'ssao resolve',
      colorAttachments: [
        { view: sceneColor, loadOp: 'load', storeOp: 'store' },
      ],
      timestampWrites: timer.writes('ao resolve'),
    });
    resolvePass.setPipeline(this.resolvePipeline!);
    resolvePass.setBindGroup(0, this.resolveBindGroup!);
    resolvePass.draw(3);
    resolvePass.end();
  }

  /** Draws `debugView` over the swapchain. Inert while it is 'off'. */
  renderDebug(renderer: Renderer): void {
    if (this.debugView === 'off' || !this.computedThisFrame) return;
    const bindGroup =
      this.debugView === 'raw'
        ? this.rawDebugBindGroup
        : this.blurredDebugBindGroup;
    if (!this.debugPipeline || !bindGroup) return;

    const encoder = renderer.device.createCommandEncoder({
      label: 'ssao debug encoder',
    });
    const pass = encoder.beginRenderPass({
      label: 'ssao debug',
      colorAttachments: [
        {
          view: renderer.getCurrentTextureView(),
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.debugPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    renderer.device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    this.raw?.destroy();
    this.blurred?.destroy();
    this.params?.destroy();
    this.raw = null;
    this.blurred = null;
    this.params = null;
    this.aoPipeline = null;
    this.blurPipeline = null;
    this.resolvePipeline = null;
    this.debugPipeline = null;
    this.boundDepth = null;
    this.boundIndirect = null;
    this.builtRevision = -1;
  }

  private build(renderer: Renderer): void {
    const { device } = renderer;
    const quality = renderer.quality.aspect('ao');
    const tier = aoConfig(quality);
    this.builtRevision = renderer.quality.revision;
    this.samples = tier.samples;
    this.radius = tier.radius;
    this.fadeStart = tier.fadeStart;
    this.fadeEnd = tier.fadeEnd;

    const aoModule = device.createShaderModule({
      label: 'ssao shader',
      code: composeShader([ssaoShader], aoShaderDefines(quality)),
    });
    this.aoPipeline = device.createRenderPipeline({
      label: 'ssao pipeline',
      layout: 'auto',
      vertex: { module: aoModule, entryPoint: 'vs' },
      fragment: {
        module: aoModule,
        entryPoint: 'fs',
        targets: [{ format: AO_FORMAT }],
      },
      primitive: { topology: 'triangle-list' },
    });

    if (!this.blurPipeline) {
      const blurModule = device.createShaderModule({
        label: 'ssao blur shader',
        code: blurShader,
      });
      this.blurPipeline = device.createRenderPipeline({
        label: 'ssao blur pipeline',
        layout: 'auto',
        vertex: { module: blurModule, entryPoint: 'vs' },
        fragment: {
          module: blurModule,
          entryPoint: 'fs',
          targets: [{ format: AO_FORMAT }],
        },
        primitive: { topology: 'triangle-list' },
      });

      const resolveModule = device.createShaderModule({
        label: 'ssao resolve shader',
        code: resolveShader,
      });
      this.resolvePipeline = device.createRenderPipeline({
        label: 'ssao resolve pipeline',
        layout: 'auto',
        vertex: { module: resolveModule, entryPoint: 'vs' },
        fragment: {
          module: resolveModule,
          entryPoint: 'fs',
          targets: [
            {
              format: renderer.sceneColorFormat,
              blend: {
                // dst * alpha - src: alpha scales the whole colour, rgb
                // takes the rest of the indirect share.
                color: {
                  srcFactor: 'one',
                  dstFactor: 'src-alpha',
                  operation: 'reverse-subtract',
                },
                alpha: {
                  srcFactor: 'zero',
                  dstFactor: 'one',
                  operation: 'add',
                },
              },
              writeMask:
                GPUColorWrite.RED | GPUColorWrite.GREEN | GPUColorWrite.BLUE,
            },
          ],
        },
        primitive: { topology: 'triangle-list' },
      });

      const debugModule = device.createShaderModule({
        label: 'ssao debug shader',
        code: debugShader,
      });
      this.debugPipeline = device.createRenderPipeline({
        label: 'ssao debug pipeline',
        layout: 'auto',
        vertex: { module: debugModule, entryPoint: 'vs' },
        fragment: {
          module: debugModule,
          entryPoint: 'fs',
          targets: [{ format: renderer.presentationFormat }],
        },
        primitive: { topology: 'triangle-list' },
      });

      this.params = device.createBuffer({
        label: 'ssao params',
        size: this.paramsData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    // The ssao pipeline's 'auto' layout is new, so its bind group is too.
    this.boundDepth = null;
  }

  private prepareTargets(
    device: GPUDevice,
    depth: GPUTexture,
    indirect: GPUTexture
  ): void {
    const width = Math.ceil(depth.width / 2);
    const height = Math.ceil(depth.height / 2);
    if (!this.raw || this.raw.width !== width || this.raw.height !== height) {
      this.raw?.destroy();
      this.blurred?.destroy();
      const usage =
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
      this.raw = device.createTexture({
        label: 'ssao raw',
        size: [width, height],
        format: AO_FORMAT,
        usage,
      });
      this.blurred = device.createTexture({
        label: 'ssao blurred',
        size: [width, height],
        format: AO_FORMAT,
        usage,
      });
      this.rawView = this.raw.createView();
      this.blurredView = this.blurred.createView();
      this.boundDepth = null;
    }

    if (depth === this.boundDepth && indirect === this.boundIndirect) return;
    this.boundDepth = depth;
    this.boundIndirect = indirect;

    const depthView = depth.createView({ aspect: 'depth-only' });
    const params = { buffer: this.params! };
    this.aoBindGroup = device.createBindGroup({
      label: 'ssao',
      layout: this.aoPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: depthView },
        { binding: 1, resource: params },
      ],
    });
    this.blurBindGroup = device.createBindGroup({
      label: 'ssao blur',
      layout: this.blurPipeline!.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: this.rawView! }],
    });
    this.resolveBindGroup = device.createBindGroup({
      label: 'ssao resolve',
      layout: this.resolvePipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: depthView },
        { binding: 1, resource: this.blurredView! },
        { binding: 2, resource: indirect.createView() },
        { binding: 3, resource: params },
      ],
    });
    this.rawDebugBindGroup = device.createBindGroup({
      label: 'ssao debug raw',
      layout: this.debugPipeline!.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: this.rawView! }],
    });
    this.blurredDebugBindGroup = device.createBindGroup({
      label: 'ssao debug blurred',
      layout: this.debugPipeline!.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: this.blurredView! }],
    });
  }
}
