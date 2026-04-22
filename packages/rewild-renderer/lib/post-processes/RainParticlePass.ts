import { Renderer } from '../Renderer';
import rainComputeShader from '../shaders/rainCompute.wgsl';
import rainRenderShader from '../shaders/rainRender.wgsl';

const PARTICLE_COUNT = 50000;
// Particle struct: vec3 position (12) + f32 seed (4) + vec3 velocity (12) + f32 _pad (4) = 32 bytes
const PARTICLE_STRIDE = 32;

// ── Compute uniforms (192 bytes = 48 f32s) ───────────────────────────────────
// [0,1,2]  cameraPos   (vec3, align=16, size=12)
// [3]      deltaTime
// [4,5]    windDir     (vec2, align=8)
// [6]      windSpeed
// [7]      temperature
// [8]      iTime
// [9]      spawnRadius
// [10]     spawnHeight
// [11-15]  padding (5×f32 fills to byte 64)
// [16-31]  viewProj    (mat4x4 — 16 f32s, align=16 @ byte 64)
// [32-47]  invViewProj (mat4x4 — 16 f32s, align=16 @ byte 128)
const CU = 48;

// ── Render uniforms (112 bytes = 28 f32s) ────────────────────────────────────
// [0-15]   viewProj    (mat4x4, align=16, size=64)
// [16,17,18] cameraPos (vec3, align=16, size=12)
// [19]     temperature
// [20,21]  windDir     (vec2, align=8)
// [22]     windSpeed   (gust-adjusted effective speed)
// [23]     precipitation
// [24-27]  padding
const RU = 28;

export interface RainParticleParams {
  viewProj:     Float32Array;   // 16 elements, column-major
  viewProjInv:  Float32Array;   // 16 elements, inverse of viewProj
  cameraX:      number;
  cameraY:      number;
  cameraZ:      number;
  windDirX:     number;         // normalised
  windDirY:     number;
  windSpeed:    number;         // base wind speed (m/s)
  windSpeedEff: number;         // gust-adjusted effective speed for rendering
  temperature:  number;         // 0 = snow, 1 = rain
  precipitation: number;        // 0–1
  sunUpDot:     number;         // sun elevation dot product: -1=night, 0=horizon, +1=zenith
  spawnRadius?: number;         // half-width of spawn box in XZ (default 60 m)
  spawnHeight?: number;         // height of spawn box above camera (default 40 m)
}

export class RainParticlePass {
  private particleBuffer:    GPUBuffer;
  private computeUniformBuf: GPUBuffer;
  private renderUniformBuf:  GPUBuffer;
  private computePipeline:   GPUComputePipeline;
  private renderPipeline:    GPURenderPipeline;
  private computeBindGroup:  GPUBindGroup;
  private renderBindGroup:   GPUBindGroup;

  private cu = new Float32Array(CU);
  private ru = new Float32Array(RU);

  init(renderer: Renderer): void {
    this.dispose();
    const { device } = renderer;

    // ── Particle storage buffer ───────────────────────────────────────────
    this.particleBuffer = device.createBuffer({
      label: 'rain particles',
      size:  PARTICLE_COUNT * PARTICLE_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Each particle is 8 floats: [px,py,pz,seed, vx,vy,vz,_pad]
    // Positions start at 0 so the spawn-volume test triggers immediate respawn.
    const initial = new Float32Array(PARTICLE_COUNT * 8);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      initial[i * 8 + 3] = Math.random(); // seed
    }
    device.queue.writeBuffer(this.particleBuffer, 0, initial);

    // ── Uniform buffers (256-byte aligned for WebGPU) ─────────────────────
    this.computeUniformBuf = device.createBuffer({
      label: 'rain compute uniforms',
      size:  256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.renderUniformBuf = device.createBuffer({
      label: 'rain render uniforms',
      size:  256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // ── Compute pipeline ──────────────────────────────────────────────────
    const computeModule = device.createShaderModule({
      label: 'rain compute shader',
      code:  rainComputeShader,
    });
    this.computePipeline = device.createComputePipeline({
      label:   'rain compute pipeline',
      layout:  'auto',
      compute: { module: computeModule, entryPoint: 'computeMain' },
    });
    this.computeBindGroup = device.createBindGroup({
      label:  'rain compute bind group',
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: { buffer: this.computeUniformBuf } },
        { binding: 2, resource: renderer.depthTexture.createView({ aspect: 'depth-only' }) },
      ],
    });

    // ── Render pipeline (outputs directly to swapchain / canvas) ──────────
    const renderModule = device.createShaderModule({
      label: 'rain render shader',
      code:  rainRenderShader,
    });
    const blendState: GPUBlendState = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one',       dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
    this.renderPipeline = device.createRenderPipeline({
      label:  'rain render pipeline',
      layout: 'auto',
      vertex:   { module: renderModule, entryPoint: 'vs' },
      fragment: {
        module:  renderModule,
        entryPoint: 'fs',
        targets: [{
          format: renderer.presentationFormat,
          blend:  blendState,
        }],
      },
      primitive:    { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format:            'depth24plus',
        depthWriteEnabled: false,
        depthCompare:      'less',
      },
    });
    this.renderBindGroup = device.createBindGroup({
      label:  'rain render bind group',
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: { buffer: this.renderUniformBuf } },
      ],
    });
  }

  /** Run the compute pass to advance particle simulation by deltaMs. */
  simulate(renderer: Renderer, params: RainParticleParams, deltaMs: number): void {
    const cu = this.cu;
    const dt = Math.min(deltaMs / 1000, 0.05);

    cu[0]  = params.cameraX;
    cu[1]  = params.cameraY;
    cu[2]  = params.cameraZ;
    cu[3]  = dt;
    cu[4]  = params.windDirX;
    cu[5]  = params.windDirY;
    cu[6]  = params.windSpeed;
    cu[7]  = params.temperature;
    cu[8]  = renderer.totalDeltaTime / 1000;
    cu[9]  = params.spawnRadius ?? 60.0;
    cu[10] = params.spawnHeight ?? 40.0;
    // [11-15] remain 0 (padding to byte 64)
    cu.set(params.viewProj,    16); // viewProj    at f32 index 16 (byte 64)
    cu.set(params.viewProjInv, 32); // invViewProj at f32 index 32 (byte 128)

    renderer.device.queue.writeBuffer(this.computeUniformBuf, 0, cu.buffer, 0, CU * 4);

    const enc  = renderer.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.computePipeline);
    pass.setBindGroup(0, this.computeBindGroup);
    pass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / 64));
    pass.end();
    renderer.device.queue.submit([enc.finish()]);
  }

  /** Render particles directly onto the canvas, after the sky compositor. */
  render(renderer: Renderer, params: RainParticleParams): void {
    const ru = this.ru;

    ru.set(params.viewProj, 0);
    ru[16] = params.cameraX;
    ru[17] = params.cameraY;
    ru[18] = params.cameraZ;
    ru[19] = params.temperature;
    ru[20] = params.windDirX;
    ru[21] = params.windDirY;
    ru[22] = params.windSpeedEff;
    ru[23] = params.precipitation;
    ru[24] = params.sunUpDot;
    // [25-27] remain 0 (padding)

    renderer.device.queue.writeBuffer(this.renderUniformBuf, 0, ru.buffer, 0, RU * 4);

    const enc  = renderer.device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view:    renderer.getCurrentTextureView(),
        loadOp:  'load',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view:         renderer.depthTexture.createView(),
        depthLoadOp:  'load',
        depthStoreOp: 'store',
      },
    });

    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.renderBindGroup);
    const activeCount = Math.ceil(PARTICLE_COUNT * params.precipitation);
    pass.draw(6, activeCount);
    pass.end();
    renderer.device.queue.submit([enc.finish()]);
  }

  dispose(): void {
    this.particleBuffer?.destroy();
    this.computeUniformBuf?.destroy();
    this.renderUniformBuf?.destroy();
  }
}
