import { Camera } from '../core/Camera';
import { Renderer } from '../Renderer';
import { RenderQuality } from '../utils/RenderQuality';
import shader from '../shaders/heat-shimmer.wgsl';
import vertexScreenQuadShader from '../shaders/utils/vertexScreenQuad.wgsl';
import { FrameCopy } from './FrameCopy';
import { IFrameEffect } from './IFrameEffect';

const PARAMS_FLOATS = 24;
// The weather's temperature (0..1) over which the haze fades in. An arid noon
// under a clear sky reaches 1; a tropical one only a little over HEAT_START.
const HEAT_START = 0.85;
const HEAT_FULL = 1;
// Rows of noise cells the haze rises a second, and the rows before it repeats
// (heat-shimmer.wgsl NOISE_PERIOD).
const RISE_CELLS_PER_SECOND = 2.5;
const NOISE_PERIOD = 256;

const OCTAVES: Record<RenderQuality, number> = {
  ultra: 2,
  high: 2,
  medium: 1,
  low: 0,
};

/** Noise octaves the haze takes at a tier; 0 is off. */
export function heatShimmerOctaves(quality: RenderQuality): number {
  return OCTAVES[quality];
}

/** 0..1: how strong the haze is at the weather's `temperature`. */
export function heatShimmerStrength(temperature: number): number {
  const t = Math.min(
    Math.max((temperature - HEAT_START) / (HEAT_FULL - HEAT_START), 0),
    1
  );
  return t * t * (3 - 2 * t);
}

/**
 * Heat haze in hot weather: the composited frame shifted by rising noise
 * along rays near level, far from the camera (heat-shimmer.wgsl). It follows
 * the sky's temperature, and a frame too cool for it, under water, or on the
 * low `heatShimmer` tier costs nothing.
 *
 *     renderer.heatShimmer.strength = 0.5;
 *     renderer.heatShimmer.heat = 1; // as on an arid noon, whatever the weather
 */
export class HeatShimmer implements IFrameEffect {
  /** Scale on the haze; 1 is the default. */
  strength = 1;
  /** A temperature, 0..1, in place of the weather's; null follows the weather. */
  heat: number | null = null;

  private readonly frame = new FrameCopy('heat shimmer frame');
  private data = new Float32Array(PARAMS_FLOATS);
  private params: GPUBuffer | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private group: GPUBindGroup | null = null;
  private boundDepth: GPUTexture | null = null;
  private rise = 0;
  private readonly colorAttachment: GPURenderPassColorAttachment = {
    view: null as unknown as GPUTextureView,
    loadOp: 'load',
    storeOp: 'store',
  };
  private readonly passDescriptor: GPURenderPassDescriptor = {
    label: 'heat shimmer',
    colorAttachments: [this.colorAttachment],
  };
  private readonly submissions: GPUCommandBuffer[] = [];

  render(
    renderer: Renderer,
    camera: Camera,
    scene: GPUTexture,
    sceneView: GPUTextureView
  ): void {
    this.rise =
      (this.rise + (renderer.delta / 1000) * RISE_CELLS_PER_SECOND) %
      NOISE_PERIOD;
    const octaves = heatShimmerOctaves(renderer.quality.aspect('heatShimmer'));
    const strength =
      this.strength *
      heatShimmerStrength(this.heat ?? renderer.sky.skyRenderer.temperature);
    if (
      strength <= 0 ||
      octaves === 0 ||
      renderer.sampleCount > 1 ||
      renderer.terrainRenderer.underWater.submerged
    )
      return;

    const { device } = renderer;
    this.prepare(renderer, scene);

    const d = this.data;
    const v = camera.matrixWorldInverse.elements;
    d.set(camera.projectionMatrixInverse.elements, 0);
    d[16] = v[4];
    d[17] = v[5];
    d[18] = v[6];
    d[19] = this.rise;
    d[20] = scene.width;
    d[21] = scene.height;
    d[22] = strength;
    d[23] = octaves;
    device.queue.writeBuffer(this.params!, 0, d);
    this.colorAttachment.view = sceneView;

    const encoder = device.createCommandEncoder({ label: 'heat shimmer' });
    this.frame.copy(encoder, scene);
    const pass = encoder.beginRenderPass(this.passDescriptor);
    pass.setPipeline(this.pipeline!);
    pass.setBindGroup(0, this.group!);
    pass.draw(6);
    pass.end();
    this.submissions[0] = encoder.finish();
    device.queue.submit(this.submissions);
  }

  dispose(): void {
    this.frame.dispose();
    this.params?.destroy();
    this.params = null;
    this.pipeline = null;
    this.group = null;
    this.boundDepth = null;
  }

  // Makes the pipeline once, and the group whenever the frame copy or the
  // depth target is replaced.
  private prepare(renderer: Renderer, scene: GPUTexture): void {
    const { device, sceneColorFormat } = renderer;
    if (!this.pipeline)
      this.pipeline = device.createRenderPipeline({
        label: 'heat shimmer',
        layout: 'auto',
        vertex: {
          module: device.createShaderModule({ code: vertexScreenQuadShader }),
          entryPoint: 'vs',
        },
        fragment: {
          module: device.createShaderModule({
            label: 'heat shimmer',
            code: shader,
          }),
          entryPoint: 'fs',
          targets: [{ format: sceneColorFormat }],
        },
      });
    if (!this.params)
      this.params = device.createBuffer({
        label: 'heat shimmer params',
        size: PARAMS_FLOATS * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

    const resized = this.frame.prepare(device, scene);
    if (!resized && this.group && this.boundDepth === renderer.depthTexture)
      return;

    this.boundDepth = renderer.depthTexture;
    this.group = device.createBindGroup({
      label: 'heat shimmer',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: this.frame.view! },
        {
          binding: 2,
          resource: renderer.samplerManager.get('linear-clamped'),
        },
        { binding: 3, resource: renderer.depthTexture.createView() },
      ],
    });
  }
}
