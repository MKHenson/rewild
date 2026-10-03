import { Matrix4, smoothstep } from 'rewild-common';
import { Camera } from '../../core/Camera';
import { Renderer } from '../../Renderer';
import shader from '../../shaders/water-lens.wgsl';
import vertexScreenQuadShader from '../../shaders/utils/vertexScreenQuad.wgsl';
import { DROP_FLOATS, LensDrops, MAX_DROPS } from './LensDrops';
import { UnderWater } from './UnderWater';
import { GpuPassTimer } from '../../metrics/GpuPassTimer';
import { waterLensQuality } from './WaterQuality';
import { gustField, gustShare } from '../sky/GustField';
import { rainShare } from '../sky/RainWetness';

/** How water on the lens blurs the view. */
export interface LensBlurSettings {
  /** Blur radius over the frame's height where the lens is in water, in a
   *  calm. Goggles turn it down; 0 is clear. */
  underWater: number;
  /** The same at windiness 1; it ramps between the two with the windiness. */
  underWaterGale: number;
  /** Seconds the view takes to clear in air after surfacing. */
  recovery: number;
  /** Blur radius over the frame's height at the screen's corners in full
   *  wind, where the eyes water. 0 is clear. */
  wind: number;
  /** Windiness 0..1 at which the wind starts to blur the view; it is full at
   *  1. */
  windStart: number;
  /** How far from the screen's centre to its corners, 0..1, the wind's blur
   *  starts; inside it the view stays clear. Below 0 the blur reaches the
   *  centre. */
  windClear: number;
  /** How far `windClear` swings either way as the eye keeps refocusing in a
   *  gale. */
  windSwing: number;
}

export const DEFAULT_LENS_BLUR: LensBlurSettings = {
  underWater: 0.0023,
  underWaterGale: 0.012,
  recovery: 3,
  wind: 0.02,
  windStart: 0.8,
  windClear: -0.3,
  windSwing: 0.25,
};

// Mips of the frame copy: enough for the widest blur.
const FRAME_MIPS = 7;
// LensParams in water-lens.wgsl.
const PARAMS_FLOATS = 28;

/** 0..1: how hard rain lands on the lens (rainShare). */
export function lensRain(precipitation: number, temperature: number): number {
  return rainShare(precipitation, temperature);
}

/** Blur radius over the frame's height where the lens is in water, at
 *  `windiness` 0..1: from `underWater` in a calm to `underWaterGale`. */
export function underWaterBlur(
  settings: LensBlurSettings,
  windiness: number
): number {
  const t = Math.min(1, Math.max(0, windiness));
  return (
    settings.underWater + (settings.underWaterGale - settings.underWater) * t
  );
}

/** 0..1: how much the wind blurs the view at `windiness`, from `start` up
 *  to full at 1. */
export function windBlurShare(windiness: number, start: number): number {
  return smoothstep(windiness, start, 1);
}

/**
 * 0..1: how squarely the camera faces into the wind, 1 looking where it comes
 * from and 0 with its back to it, eased between. (`forwardX`, `forwardZ`) is
 * the camera's forward direction and (`airX`, `airZ`) the way the air moves.
 * Looking straight up or down, it is half.
 */
export function windFacing(
  forwardX: number,
  forwardZ: number,
  airX: number,
  airZ: number
): number {
  const forward = Math.hypot(forwardX, forwardZ);
  const air = Math.hypot(airX, airZ);
  if (forward < 1e-4 || air < 1e-4) return 0.5;
  const into = -(forwardX * airX + forwardZ * airZ) / (forward * air);
  return smoothstep(into, -1, 1);
}

/** Seconds the eye takes to blur as a gust hits, by e, and to refocus as it
 *  passes. */
const GUST_ATTACK = 0.25;
const GUST_RELEASE = 1.5;

/** The eye's blur `envelope` after `seconds` following `gust`: quick to
 *  blur, slow to refocus. */
export function followGust(
  envelope: number,
  gust: number,
  seconds: number
): number {
  const time = gust > envelope ? GUST_ATTACK : GUST_RELEASE;
  return envelope + (gust - envelope) * (1 - Math.exp(-seconds / time));
}

/** The wind's blur between gusts, as a share of its full strength. */
const GUST_CALM = 0.4;
/** The furthest out the clear middle reaches. */
const CLEAR_MAX = 0.9;

/** -1..1: the eye refocusing in the wind at `clock`, the wind's clock: three
 *  sines from about 0.3 to 1.2 a second, so it never settles into a rhythm. */
export function eyeAdjust(clock: number): number {
  return (
    Math.sin(clock * 1.7) * 0.5 +
    Math.sin(clock * 3.9 + 2.1) * 0.3 +
    Math.sin(clock * 7.3 + 0.6) * 0.2
  );
}

/**
 * The air-side blur after surfacing, 1 as the lens leaves the water, easing
 * to 0 over `recovery` seconds. `since` is the seconds since surfacing.
 */
export function airBlurShare(since: number, recovery: number): number {
  if (recovery <= 0 || since >= recovery) return 0;
  const t = 1 - since / recovery;
  return t * t;
}

/**
 * Water on the camera's lens (water-lens.wgsl): the view blurs where the lens
 * is wet, bends along the waterline where the surface crosses it, and carries
 * drops for a while after surfacing. It draws over the composited frame
 * before the tonemap, and only while there is something to show.
 */
export class WaterLens {
  settings: LensBlurSettings = { ...DEFAULT_LENS_BLUR };
  readonly drops = new LensDrops();
  private wasSubmerged = false;
  // The eye's response to the gusts, 0..1 (followGust).
  private gust = 0;
  private sinceSurfacing = Infinity;

  private frame: GPUTexture | null = null;
  private params: GPUBuffer | null = null;
  private dropBuffer: GPUBuffer | null = null;
  private data = new Float32Array(PARAMS_FLOATS);
  private lensPipeline: GPURenderPipeline | null = null;
  private dropPipeline: GPURenderPipeline | null = null;
  private lensGroup: GPUBindGroup | null = null;
  private dropGroup: GPUBindGroup | null = null;
  private viewProjection = new Matrix4();

  /** Seconds since the lens last left the water. */
  get secondsSinceSurfacing(): number {
    return this.sinceSurfacing;
  }

  /** Follows the camera in and out of the water by `underWater`'s readback,
   *  ages the drops and the blur by `seconds`, and lands `rain` (lensRain)
   *  on the lens while it is in air. */
  update(
    underWater: UnderWater,
    seconds: number,
    rain: number,
    gustDrift: ArrayLike<number>,
    eyeX: number,
    eyeZ: number
  ): void {
    // The gusts the trees around the camera bend to (GustField).
    const gust = gustShare(gustField(eyeX, eyeZ, gustDrift));
    this.gust = followGust(this.gust, gust, seconds);
    const submerged = underWater.submerged;
    if (submerged) {
      this.drops.clear();
      this.sinceSurfacing = Infinity;
    } else if (this.wasSubmerged) {
      this.drops.surface();
      this.sinceSurfacing = 0;
    } else {
      this.sinceSurfacing += seconds;
      this.drops.update(seconds);
      this.drops.rain(rain, seconds);
    }
    this.wasSubmerged = submerged;
  }

  /** Draws over `scene`, the scene colour target seen through `sceneView`,
   *  before the tonemap. */
  render(
    renderer: Renderer,
    wind: ArrayLike<number>,
    camera: Camera,
    underWater: UnderWater,
    scene: GPUTexture,
    sceneView: GPUTextureView,
    timer?: GpuPassTimer
  ): void {
    const air = airBlurShare(this.sinceSurfacing, this.settings.recovery);
    const world = camera.transform.matrixWorld.elements;
    // The camera looks down its −z axis; the wind's vec is xz the way the air
    // moves, z its strength (WindState).
    const windy = windBlurShare(wind[2], this.settings.windStart);
    const windBlur =
      this.settings.wind *
      windy *
      windFacing(-world[8], -world[10], wind[0], wind[1]) *
      (GUST_CALM + (1 - GUST_CALM) * this.gust);
    // The full-screen draw blurs and draws the waterline; rain alone needs
    // only the drops.
    const lens =
      underWater.submerged ||
      (underWater.possible && underWater.nearSurface) ||
      air > 0 ||
      windBlur > 0;
    const active = lens || this.drops.wet;
    if (!active || renderer.sampleCount > 1) return;
    const { device } = renderer;
    this.prepare(renderer, scene);

    const encoder = device.createCommandEncoder({ label: 'water lens copy' });
    encoder.copyTextureToTexture({ texture: scene }, { texture: this.frame! }, [
      scene.width,
      scene.height,
    ]);
    device.queue.submit([encoder.finish()]);
    renderer.mipmapGenerator.generateMips(
      device,
      this.frame!,
      0,
      timer?.writes('lens-frame')
    );

    const height = scene.height;
    this.viewProjection
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .invert();
    const d = this.data;
    d.set(this.viewProjection.elements, 0);
    d[16] = scene.width;
    d[17] = height;
    const wetBlur = underWaterBlur(this.settings, wind[2]);
    d[18] = wetBlur * height;
    d[19] = wetBlur * height * air;
    d[20] = windBlur * height;
    // The clear middle swings as the eye refocuses, more the windier it is.
    d[21] = Math.min(
      CLEAR_MAX,
      this.settings.windClear +
        this.settings.windSwing * eyeAdjust(wind[3]) * windy
    );
    const quality = waterLensQuality(renderer.quality.aspect('water'));
    this.drops.setShare(quality.dropShare);
    d[24] = quality.blurTaps;
    d[25] = quality.trailBlur ? 1 : 0;
    device.queue.writeBuffer(this.params!, 0, d);
    const drops = this.drops.count;
    if (drops > 0)
      device.queue.writeBuffer(
        this.dropBuffer!,
        0,
        this.drops.data,
        0,
        drops * DROP_FLOATS
      );

    const lensEncoder = device.createCommandEncoder({ label: 'water lens' });
    const pass = lensEncoder.beginRenderPass({
      label: 'water lens',
      timestampWrites: timer?.writes('lens'),
      colorAttachments: [{ view: sceneView, loadOp: 'load', storeOp: 'store' }],
    });
    if (lens) {
      pass.setPipeline(this.lensPipeline!);
      pass.setBindGroup(0, this.lensGroup!);
      pass.draw(6);
    }
    if (drops > 0) {
      pass.setPipeline(this.dropPipeline!);
      pass.setBindGroup(0, this.dropGroup!);
      // A body quad and a trail quad each (vs_drop).
      pass.draw(12, drops);
    }
    pass.end();
    device.queue.submit([lensEncoder.finish()]);
  }

  dispose(): void {
    this.frame?.destroy();
    this.params?.destroy();
    this.dropBuffer?.destroy();
    this.frame = null;
    this.params = null;
    this.dropBuffer = null;
    this.lensGroup = null;
    this.dropGroup = null;
  }

  // Makes the pipelines once, and the frame copy and groups whenever the
  // scene target's size changes.
  private prepare(renderer: Renderer, scene: GPUTexture): void {
    const { device } = renderer;
    if (!this.lensPipeline) this.createPipelines(renderer);
    if (!this.params) {
      this.params = device.createBuffer({
        label: 'water lens params',
        size: PARAMS_FLOATS * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.dropBuffer = device.createBuffer({
        label: 'water lens drops',
        size: MAX_DROPS * DROP_FLOATS * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }
    if (
      this.frame &&
      this.frame.width === scene.width &&
      this.frame.height === scene.height
    )
      return;
    this.frame?.destroy();
    this.frame = device.createTexture({
      label: 'water lens frame',
      size: [scene.width, scene.height],
      format: scene.format,
      mipLevelCount: Math.min(
        FRAME_MIPS,
        Math.floor(Math.log2(Math.max(scene.width, scene.height))) + 1
      ),
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const frameView = this.frame.createView();
    const sampler = renderer.samplerManager.get('linear-clamped');
    const underWater = renderer.terrainRenderer.underWater.buffer(device);
    this.lensGroup = device.createBindGroup({
      label: 'water lens',
      layout: this.lensPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: underWater } },
        { binding: 2, resource: frameView },
        { binding: 3, resource: sampler },
      ],
    });
    this.dropGroup = device.createBindGroup({
      label: 'water lens drops',
      layout: this.dropPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 2, resource: frameView },
        { binding: 3, resource: sampler },
        { binding: 4, resource: { buffer: this.dropBuffer! } },
      ],
    });
  }

  private createPipelines(renderer: Renderer): void {
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({
      label: 'water lens',
      code: shader,
    });
    this.lensPipeline = device.createRenderPipeline({
      label: 'water lens',
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({ code: vertexScreenQuadShader }),
        entryPoint: 'vs',
      },
      fragment: {
        module,
        entryPoint: 'fs_lens',
        targets: [{ format: sceneColorFormat }],
      },
    });
    this.dropPipeline = device.createRenderPipeline({
      label: 'water lens drops',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs_drop' },
      fragment: {
        module,
        entryPoint: 'fs_drop',
        targets: [
          {
            format: sceneColorFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
              },
              alpha: { srcFactor: 'zero', dstFactor: 'one' },
            },
          },
        ],
      },
    });
  }
}
