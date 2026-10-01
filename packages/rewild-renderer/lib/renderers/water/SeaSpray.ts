import { Matrix4 } from 'rewild-common';
import { Camera } from '../../core/Camera';
import { Renderer } from '../../Renderer';
import updateShader from '../../shaders/sea-spray-update.wgsl';
import drawShader from '../../shaders/sea-spray.wgsl';
import skyConstants from '../../shaders/sky/skyConstants.wgsl';
import fogShader from '../../shaders/sky/fog.wgsl';
import { OceanFFT } from './OceanFFT';

// Sea spray: a pool of particles that rise from breaking crests near the
// camera (after GodotOceanWaves). A compute pass spawns them where the ocean's
// foam is thick over open sea, and from the shore: surf where shore waves
// break and plumes where crests hit rock, as the crests arrive. A draw after
// the atmosphere composite animates them on the waves and fogs them as the
// scene is fogged.

/** Particles in the pool. */
export const SPRAY_PARTICLES = 4096;
const PARTICLE_BYTES = 48;

// The depth mask: metres of sea on a grid around the camera, from the
// terrain's heights, so spray rises only over open water and plumes only
// beside known land. It spans the
// spray's reach and is rebuilt when the camera crosses a texel or every
// MASK_REFRESH seconds, as chunks load.
const MASK_TEXELS = 64;
const MASK_REFRESH = 1;

// SprayParams in sea-spray-common.wgsl.
const PARAMS_FLOATS = 76;

/** How a puff looks; blended by the windiness between two ends. */
export interface SprayShape {
  /** Metres a puff spans at full strength. */
  size: number;
  /** Metres a puff rises at full strength. */
  rise: number;
  /** Seconds a puff lives, ±30%. */
  lifetime: number;
  /** 0..1. */
  opacity: number;
}

/** What shapes the spray; see SprayParams in sea-spray-common.wgsl. */
export interface SpraySettings {
  /** The shape when the first crests break, at MODERATE_WINDINESS and below. */
  moderate: SprayShape;
  /** The shape in a storm, at windiness 1. */
  storm: SprayShape;
  /** Foam coverage 0..1 a crest needs to throw spray. */
  spawnFoam: number;
  /** Metres from the camera spray reaches. */
  reach: number;
  /** Windiness 0..1 below which none rises. */
  minWindiness: number;
  /** Metres a second a puff drifts downwind in full wind. */
  drift: number;
  /** Surf thrown where a shore wave breaks, at full strength. */
  surf: SprayShape;
  /** A plume where a crest hits rock, at full strength. */
  impact: SprayShape;
  /** 0..1: share of the pool kept for surf and plumes. */
  shoreShare: number;
  /** Windiness 0..1 below which no surf rises. */
  surfMinWindiness: number;
  /** Metres of wave height a plume needs. */
  impactMinHeight: number;
  /** Metres of wave height at which surf and plumes are at full strength. */
  shoreFullHeight: number;
}

/** Windiness at which the spray has its moderate shape. It blends to the
 *  storm shape at 1. */
export const MODERATE_WINDINESS = 0.7;

export const DEFAULT_SPRAY: SpraySettings = {
  moderate: { size: 2, rise: 1.3, lifetime: 1.6, opacity: 0.05 },
  storm: { size: 12, rise: 1.8, lifetime: 2.6, opacity: 0.05 },
  spawnFoam: 0.75,
  reach: 150,
  minWindiness: 0.45,
  drift: 2,
  surf: { size: 12, rise: 1.8, lifetime: 2.2, opacity: 0.05 },
  impact: { size: 7, rise: 6, lifetime: 3, opacity: 0.15 },
  shoreShare: 0.25,
  surfMinWindiness: 0.7,
  impactMinHeight: 1,
  shoreFullHeight: 5,
};

/** The shape of the spray at `windiness` 0..1. */
export function sprayShapeAt(
  settings: SpraySettings,
  windiness: number
): SprayShape {
  const t = Math.min(
    1,
    Math.max(0, (windiness - MODERATE_WINDINESS) / (1 - MODERATE_WINDINESS))
  );
  const { moderate: a, storm: b } = settings;
  return {
    size: a.size + (b.size - a.size) * t,
    rise: a.rise + (b.rise - a.rise) * t,
    lifetime: a.lifetime + (b.lifetime - a.lifetime) * t,
    opacity: a.opacity + (b.opacity - a.opacity) * t,
  };
}

/** The depth mask's value where the ground is not loaded. */
export const UNKNOWN_GROUND = -1;

/** Metres of sea at world (x, z): sea level less the ground, 0 on land, or
 *  UNKNOWN_GROUND where the ground is not loaded. */
export function seaDepthAt(seaLevel: number, ground: number | null): number {
  return ground === null ? UNKNOWN_GROUND : Math.max(0, seaLevel - ground);
}

export class SeaSpray {
  settings: SpraySettings = {
    ...DEFAULT_SPRAY,
    moderate: { ...DEFAULT_SPRAY.moderate },
    storm: { ...DEFAULT_SPRAY.storm },
    surf: { ...DEFAULT_SPRAY.surf },
    impact: { ...DEFAULT_SPRAY.impact },
  };

  private particles: GPUBuffer;
  private params: GPUBuffer;
  private data = new Float32Array(PARAMS_FLOATS);
  private mask: GPUTexture;
  private maskData = new Float32Array(MASK_TEXELS * MASK_TEXELS);
  private maskX = NaN;
  private maskZ = NaN;
  private maskAge = Infinity;
  private time = 0;
  private frame = 0;

  private updatePipeline: GPUComputePipeline;
  private updateGroup: GPUBindGroup;
  private drawPipeline: GPURenderPipeline | null = null;
  private drawGroup: GPUBindGroup | null = null;
  // What the draw group was built against; a resize or a new sky replaces them.
  private drawDepth: GPUTexture | null = null;
  private drawIrradiance: GPUTexture | null = null;
  private drawAtmosphere: GPUBuffer | null = null;

  private view = new Matrix4();
  private viewProj = new Matrix4();
  private invViewProj = new Matrix4();

  constructor(
    device: GPUDevice,
    private ocean: OceanFFT,
    private waves: GPUBuffer,
    shoreField: GPUTexture,
    shoreSampler: GPUSampler
  ) {
    this.particles = device.createBuffer({
      label: 'sea spray particles',
      size: SPRAY_PARTICLES * PARTICLE_BYTES,
      usage: GPUBufferUsage.STORAGE,
    });
    this.params = device.createBuffer({
      label: 'sea spray params',
      size: PARAMS_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.mask = device.createTexture({
      label: 'sea spray depth mask',
      size: [MASK_TEXELS, MASK_TEXELS],
      format: 'r32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    this.updatePipeline = device.createComputePipeline({
      label: 'sea spray update',
      layout: 'auto',
      compute: {
        module: device.createShaderModule({
          label: 'sea spray update',
          code: updateShader,
        }),
        entryPoint: 'update',
      },
    });
    this.updateGroup = device.createBindGroup({
      label: 'sea spray update',
      layout: this.updatePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.particles } },
        { binding: 2, resource: { buffer: this.waves } },
        {
          binding: 3,
          resource: this.ocean.displacement.createView({
            dimension: '2d-array',
          }),
        },
        { binding: 4, resource: this.ocean.sampler },
        { binding: 5, resource: this.mask.createView() },
        { binding: 6, resource: shoreField.createView() },
        { binding: 7, resource: shoreSampler },
      ],
    });
  }

  /**
   * Advances the spray by `deltaSeconds` and spawns new puffs. `wind` is the
   * sky's wind (direction xz, windiness); `sun` the key light's radiance, rgb;
   * `sampleGround` reads the terrain height, null where it is not loaded.
   */
  update(
    device: GPUDevice,
    deltaSeconds: number,
    camera: Camera,
    wind: ArrayLike<number>,
    sun: ArrayLike<number>,
    seaLevel: number,
    sampleGround: (x: number, z: number) => number | null
  ): void {
    this.time += deltaSeconds;
    this.frame = (this.frame + 1) % 65536;
    const settings = this.settings;

    const world = camera.transform.matrixWorld.elements;
    const eyeX = world[12];
    const eyeY = world[13];
    const eyeZ = world[14];

    const texel = (settings.reach * 2) / MASK_TEXELS;
    const maskX = Math.round(eyeX / texel) * texel;
    const maskZ = Math.round(eyeZ / texel) * texel;
    this.maskAge += deltaSeconds;
    if (
      maskX !== this.maskX ||
      maskZ !== this.maskZ ||
      this.maskAge > MASK_REFRESH
    ) {
      this.buildMask(device, maskX, maskZ, texel, seaLevel, sampleGround);
    }

    const length = Math.hypot(wind[0], wind[1]) || 1;
    const shape = sprayShapeAt(settings, wind[2]);
    const d = this.data;
    d.set([eyeX, eyeY, eyeZ, this.time], 0);
    d.set([wind[0] / length, wind[1] / length, wind[2], seaLevel], 4);
    d.set([maskX, maskZ, texel, this.frame], 8);
    d.set([settings.spawnFoam, shape.size, shape.rise, shape.lifetime], 12);
    d.set(
      [settings.reach, settings.minWindiness, shape.opacity, settings.drift],
      16
    );
    d.set([sun[0], sun[1], sun[2], 1], 20);
    this.packCamera(camera);
    const { surf, impact } = settings;
    d.set([surf.size, surf.rise, surf.lifetime, surf.opacity], 64);
    d.set([impact.size, impact.rise, impact.lifetime, impact.opacity], 68);
    d.set(
      [
        Math.round(SPRAY_PARTICLES * settings.shoreShare),
        settings.surfMinWindiness,
        settings.impactMinHeight,
        settings.shoreFullHeight,
      ],
      72
    );
    device.queue.writeBuffer(this.params, 0, d);

    const encoder = device.createCommandEncoder({ label: 'sea spray update' });
    const pass = encoder.beginComputePass({ label: 'sea spray update' });
    pass.setPipeline(this.updatePipeline);
    pass.setBindGroup(0, this.updateGroup);
    pass.dispatchWorkgroups(Math.ceil(SPRAY_PARTICLES / 64));
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  /** Draws the spray over the composited HDR scene in `target`. */
  draw(renderer: Renderer, encoder: GPUCommandEncoder, target: GPUTextureView) {
    const irradiance = renderer.iblIrradianceMap;
    const atmosphere = renderer.sky?.skyRenderer?.finalPass?.uniformBuffer;
    if (!irradiance || !atmosphere) return;
    if (!this.drawPipeline)
      this.drawPipeline = this.createDrawPipeline(renderer);
    if (
      !this.drawGroup ||
      this.drawDepth !== renderer.depthTexture ||
      this.drawIrradiance !== irradiance ||
      this.drawAtmosphere !== atmosphere
    ) {
      this.drawDepth = renderer.depthTexture;
      this.drawIrradiance = irradiance;
      this.drawAtmosphere = atmosphere;
      this.drawGroup = this.createDrawGroup(renderer, irradiance, atmosphere);
    }

    const pass = encoder.beginRenderPass({
      label: 'sea spray',
      colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }],
    });
    pass.setPipeline(this.drawPipeline);
    pass.setBindGroup(0, this.drawGroup);
    pass.draw(6, SPRAY_PARTICLES);
    pass.end();
  }

  dispose(): void {
    this.particles.destroy();
    this.params.destroy();
    this.mask.destroy();
  }

  private buildMask(
    device: GPUDevice,
    centreX: number,
    centreZ: number,
    texel: number,
    seaLevel: number,
    sampleGround: (x: number, z: number) => number | null
  ) {
    const half = MASK_TEXELS / 2;
    for (let j = 0; j < MASK_TEXELS; j++)
      for (let i = 0; i < MASK_TEXELS; i++) {
        const x = centreX + (i - half + 0.5) * texel;
        const z = centreZ + (j - half + 0.5) * texel;
        this.maskData[j * MASK_TEXELS + i] = seaDepthAt(
          seaLevel,
          sampleGround(x, z)
        );
      }
    device.queue.writeTexture(
      { texture: this.mask },
      this.maskData,
      { bytesPerRow: MASK_TEXELS * 4 },
      [MASK_TEXELS, MASK_TEXELS]
    );
    this.maskX = centreX;
    this.maskZ = centreZ;
    this.maskAge = 0;
  }

  // Camera-relative view-projection and its inverse, and the camera's axes.
  private packCamera(camera: Camera) {
    this.view.copy(camera.matrixWorldInverse);
    const v = this.view.elements;
    v[12] = 0;
    v[13] = 0;
    v[14] = 0;
    this.viewProj.multiplyMatrices(camera.projectionMatrix, this.view);
    this.invViewProj.copy(this.viewProj).invert();
    this.data.set(this.viewProj.elements, 24);
    this.data.set(this.invViewProj.elements, 40);
    const w = camera.transform.matrixWorld.elements;
    const right = Math.hypot(w[0], w[1], w[2]) || 1;
    const up = Math.hypot(w[4], w[5], w[6]) || 1;
    this.data.set([w[0] / right, w[1] / right, w[2] / right, 0], 56);
    this.data.set([w[4] / up, w[5] / up, w[6] / up, 0], 60);
  }

  private createDrawPipeline(renderer: Renderer): GPURenderPipeline {
    const { device } = renderer;
    const module = device.createShaderModule({
      label: 'sea spray',
      code: skyConstants + fogShader + drawShader,
    });
    return device.createRenderPipeline({
      label: 'sea spray',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format: renderer.sceneColorFormat,
            // Premultiplied alpha.
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
  }

  private createDrawGroup(
    renderer: Renderer,
    irradiance: GPUTexture,
    atmosphere: GPUBuffer
  ): GPUBindGroup {
    return renderer.device.createBindGroup({
      label: 'sea spray',
      layout: this.drawPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.particles } },
        { binding: 2, resource: { buffer: this.waves } },
        {
          binding: 3,
          resource: this.ocean.displacement.createView({
            dimension: '2d-array',
          }),
        },
        { binding: 4, resource: this.ocean.sampler },
        {
          binding: 5,
          resource: renderer.textureManager
            .get('water-spray')
            .gpuTexture.createView(),
        },
        { binding: 6, resource: renderer.samplerManager.get('linear-clamped') },
        {
          binding: 7,
          resource: renderer.depthTexture.createView({ aspect: 'depth-only' }),
        },
        {
          binding: 8,
          resource: irradiance.createView({ dimension: 'cube' }),
        },
        { binding: 9, resource: renderer.samplerManager.get('linear-clamped') },
        { binding: 10, resource: { buffer: atmosphere } },
      ],
    });
  }
}
