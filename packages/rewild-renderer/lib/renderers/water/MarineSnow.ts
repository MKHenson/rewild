import { Matrix4 } from 'rewild-common';
import { Camera } from '../../core/Camera';
import { Renderer } from '../../Renderer';
import shader from '../../shaders/marine-snow.wgsl';
import type { Caustics } from './Caustics';
import type { OceanFFT } from './OceanFFT';

// SnowParams in marine-snow.wgsl.
const PARAMS_FLOATS = 32;

/** What marine snow looks like (marine-snow.wgsl). */
export interface SnowSettings {
  /** Specks in the box at full quality. */
  count: number;
  /** Metres the box around the camera spans. */
  box: number;
  /** Metres a speck spans, ±50%. */
  size: number;
  /** The fewest pixels a speck covers; a smaller one fades instead. */
  minPixels: number;
  /** 0..1. */
  opacity: number;
  /** Scale on the light a speck scatters. */
  brightness: number;
  /** Metres a second the current carries the specks, x, y, z. */
  current: [number, number, number];
}

export const DEFAULT_SNOW: SnowSettings = {
  count: 2048,
  box: 12,
  size: 0.008,
  minPixels: 1.5,
  opacity: 0.8,
  brightness: 1,
  current: [0.06, -0.012, 0.025],
};

/** The specks' place in the box, 0..1 per axis, for a camera at `eye` once
 *  the current has carried them `drift` metres, into `out`. */
export function snowPlace(
  eye: ArrayLike<number>,
  drift: ArrayLike<number>,
  box: number,
  out: Float32Array,
  offset = 0
): void {
  for (let i = 0; i < 3; i++) {
    const v = (drift[i] - eye[i]) / box;
    out[offset + i] = v - Math.floor(v);
  }
}

const _viewProjection = new Matrix4();
const _view = new Matrix4();

/**
 * Marine snow: specks drifting in a box that wraps around the camera, drawn
 * after the atmosphere composite while the camera is under water.
 */
export class MarineSnow {
  settings: SnowSettings = {
    ...DEFAULT_SNOW,
    current: [...DEFAULT_SNOW.current],
  };
  private pipeline: GPURenderPipeline | null = null;
  private group: GPUBindGroup | null = null;
  private params: GPUBuffer | null = null;
  private data = new Float32Array(PARAMS_FLOATS);
  private drift = new Float64Array(3);
  private eye = new Float64Array(3);
  // What the group was built against; a new sky or terrain replaces them.
  private boundIrradiance: GPUTexture | null = null;
  private boundDisplacement: GPUTexture | null = null;
  private boundWaves: GPUBuffer | null = null;

  /** Carries the specks on the current. */
  update(deltaSeconds: number): void {
    const { current, box } = this.settings;
    for (let i = 0; i < 3; i++)
      this.drift[i] = (this.drift[i] + current[i] * deltaSeconds) % box;
  }

  /**
   * Draws `share` of the specks over `target`, tested against the scene's
   * depth. `originX` and `originZ` are the waves' origin and `swell` the
   * camera's water's weight on the longest cascade.
   */
  draw(
    renderer: Renderer,
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    camera: Camera,
    share: number,
    underWater: GPUBuffer,
    waves: GPUBuffer,
    ocean: OceanFFT,
    caustics: Caustics,
    originX: number,
    originZ: number,
    swell: number
  ): void {
    const count = Math.floor(this.settings.count * share);
    const irradiance = renderer.iblIrradianceMap;
    if (count <= 0 || !irradiance) return;
    const { device } = renderer;
    if (!this.pipeline) this.createPipeline(renderer);
    if (!this.params)
      this.params = device.createBuffer({
        label: 'marine snow',
        size: PARAMS_FLOATS * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    if (
      !this.group ||
      this.boundIrradiance !== irradiance ||
      this.boundDisplacement !== ocean.displacement ||
      this.boundWaves !== waves
    ) {
      this.boundIrradiance = irradiance;
      this.boundDisplacement = ocean.displacement;
      this.boundWaves = waves;
      this.group = device.createBindGroup({
        label: 'marine snow',
        layout: this.pipeline!.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.params } },
          { binding: 1, resource: { buffer: underWater } },
          { binding: 2, resource: { buffer: waves } },
          {
            binding: 3,
            resource: ocean.displacement.createView({ dimension: '2d-array' }),
          },
          { binding: 4, resource: ocean.sampler },
          { binding: 5, resource: caustics.texture(device).createView() },
          { binding: 6, resource: caustics.sampler(device) },
          { binding: 7, resource: { buffer: caustics.buffer(device) } },
          {
            binding: 8,
            resource: irradiance.createView({ dimension: 'cube' }),
          },
          {
            binding: 9,
            resource: renderer.samplerManager.get('linear-clamped'),
          },
        ],
      });
    }

    // The view without its translation, so positions stay relative to the
    // camera and small.
    _view.copy(camera.matrixWorldInverse);
    _view.elements[12] = 0;
    _view.elements[13] = 0;
    _view.elements[14] = 0;
    _viewProjection.multiplyMatrices(camera.projectionMatrix, _view);

    const s = this.settings;
    const world = camera.transform.matrixWorld.elements;
    this.eye[0] = world[12];
    this.eye[1] = world[13];
    this.eye[2] = world[14];
    const d = this.data;
    d.set(_viewProjection.elements, 0);
    snowPlace(this.eye, this.drift, s.box, d, 16);
    d[19] = s.brightness;
    d[20] = this.eye[0] - originX;
    d[21] = this.eye[2] - originZ;
    d[22] = swell;
    d[24] = s.box;
    d[25] = s.size;
    d[26] = s.minPixels;
    d[27] = s.opacity;
    const width = renderer.canvas.width || 1;
    const height = renderer.canvas.height || 1;
    d[28] = width;
    d[29] = height;
    d[30] = (camera.projectionMatrix.elements[5] * height) / 2;
    device.queue.writeBuffer(this.params, 0, d);

    const pass = encoder.beginRenderPass({
      label: 'marine snow',
      colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }],
      depthStencilAttachment: {
        view: renderer.depthTexture.createView(),
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      },
    });
    pass.setPipeline(this.pipeline!);
    pass.setBindGroup(0, this.group!);
    pass.draw(6, count);
    pass.end();
  }

  private createPipeline(renderer: Renderer) {
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({
      label: 'marine snow',
      code: shader,
    });
    this.pipeline = device.createRenderPipeline({
      label: 'marine snow',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format: sceneColorFormat,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'zero', dstFactor: 'one' },
            },
          },
        ],
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less',
      },
      multisample: { count: renderer.sampleCount },
    });
  }

  dispose(): void {
    this.params?.destroy();
    this.params = null;
    this.group = null;
    this.boundIrradiance = null;
    this.boundDisplacement = null;
    this.boundWaves = null;
  }
}
