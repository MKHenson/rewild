import { Renderer } from '../Renderer';
import boltShader from '../shaders/lightningBolt.wgsl';
import type { LightningStrike } from '../renderers/sky/LightningController';

// ── Uniform layout (96 bytes, aligned to 256) ─────────────────────────────
//  [0..15]  viewProjMatrix  mat4x4  (64 bytes, f32 indices 0-15)
//  [16..18] cameraPosition  vec3    (12 bytes, f32 indices 16-18)
//  [19]     halfWidth       f32     ( 4 bytes)
//  [20]     intensity       f32     ( 4 bytes)
//  [21]     branchScale     f32     ( 4 bytes)
//  [22]     fogDensity      f32     ( 4 bytes)
//  [23]     _pad            f32     ( 4 bytes)
const UNIFORM_FLOATS = 24;

// ── Per-vertex layout, arrayStride 32 bytes ───────────────────────────────
//  offset  0: posA  float32x3  (12 bytes)
//  offset 12: posB  float32x3  (12 bytes)
//  offset 24: isB   float32    ( 4 bytes)  0 = A-end, 1 = B-end
//  offset 28: side  float32    ( 4 bytes)  -1 or +1
const FLOATS_PER_VERT = 8;
const BYTES_PER_VERT = FLOATS_PER_VERT * 4;
const VERTS_PER_SEG = 6;

// Pre-allocate vertex buffers for worst-case bolt size (256 segments main + 3×64 branch)
const MAX_MAIN_SEGS = 256;
const MAX_BRANCH_SEGS = 64;
const MAX_BRANCHES = 3;

export class LightningBoltPass {
  private pipeline: GPURenderPipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private mainVB: GPUBuffer | null = null;
  private branchVBs: GPUBuffer[] = [];
  private bindGroup: GPUBindGroup | null = null;

  private uniformData = new Float32Array(64); // 256 bytes
  private mainVertCount = 0;

  // Pre-allocated CPU-side staging buffers — written once per strike, uploaded to GPU
  private readonly mainStagingVerts = new Float32Array(
    MAX_MAIN_SEGS * VERTS_PER_SEG * FLOATS_PER_VERT
  );
  private readonly branchStagingVerts = [
    new Float32Array(MAX_BRANCH_SEGS * VERTS_PER_SEG * FLOATS_PER_VERT),
    new Float32Array(MAX_BRANCH_SEGS * VERTS_PER_SEG * FLOATS_PER_VERT),
    new Float32Array(MAX_BRANCH_SEGS * VERTS_PER_SEG * FLOATS_PER_VERT),
  ];
  // Fixed-length array — never reallocated, elements updated in place
  private readonly branchVertCounts = [0, 0, 0];

  // Pre-allocated GPU submit array — avoids [enc.finish()] allocation each frame
  private readonly submitArr: GPUCommandBuffer[] = [
    null as unknown as GPUCommandBuffer,
  ];

  // Pre-allocated render pass descriptor — only the view fields are updated each frame
  private readonly colorAttachment: GPURenderPassColorAttachment = {
    view: null as unknown as GPUTextureView,
    loadOp: 'load',
    storeOp: 'store',
  };
  private readonly depthAttachment: GPURenderPassDepthStencilAttachment = {
    view: null as unknown as GPUTextureView,
    depthLoadOp: 'load',
    depthStoreOp: 'store',
  };
  private readonly renderPassDesc: GPURenderPassDescriptor = {
    colorAttachments: [this.colorAttachment],
    depthStencilAttachment: this.depthAttachment,
  };
  private readonly encoderDesc = { label: 'lightning bolt' };

  // Cached depth texture view — invalidated when depthTexture reference changes
  private cachedDepthTexture: GPUTexture | null = null;
  private cachedDepthView: GPUTextureView | null = null;

  init(renderer: Renderer): void {
    const { device } = renderer;

    const module = device.createShaderModule({
      label: 'lightning bolt shader',
      code: boltShader,
    });

    this.uniformBuffer = device.createBuffer({
      label: 'lightning bolt uniforms',
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.mainVB = device.createBuffer({
      label: 'lightning bolt main vertex buffer',
      size: MAX_MAIN_SEGS * VERTS_PER_SEG * BYTES_PER_VERT,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    for (let b = 0; b < MAX_BRANCHES; b++) {
      this.branchVBs.push(
        device.createBuffer({
          label: `lightning bolt branch ${b} vertex buffer`,
          size: MAX_BRANCH_SEGS * VERTS_PER_SEG * BYTES_PER_VERT,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        })
      );
    }

    this.pipeline = device.createRenderPipeline({
      label: 'lightning bolt pipeline',
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: BYTES_PER_VERT,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' }, // posA
              { shaderLocation: 1, offset: 12, format: 'float32x3' }, // posB
              { shaderLocation: 2, offset: 24, format: 'float32' }, // isB
              { shaderLocation: 3, offset: 28, format: 'float32' }, // side
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format: renderer.presentationFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less',
      },
    });

    this.bindGroup = device.createBindGroup({
      label: 'lightning bolt bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  render(
    renderer: Renderer,
    strike: LightningStrike,
    viewProjMatrix: Float32Array,
    cameraPos: [number, number, number],
    fogDensity: number,
  ): void {
    if (!strike.boltVisible || !this.pipeline) return;

    const device = renderer.device;

    // Upload geometry for the new strike
    this.uploadPath(device, strike);

    // Write uniforms
    const u = this.uniformData;
    u.set(viewProjMatrix, 0); // viewProjMatrix  (f32 0-15)
    u[16] = cameraPos[0]; // cameraPosition
    u[17] = cameraPos[1];
    u[18] = cameraPos[2];
    u[19] = 8.0; // halfWidth in world units
    u[20] = strike.boltIntensity; // intensity
    u[21] = 0.4; // branchScale (branches at 40% intensity)
    u[22] = fogDensity;
    device.queue.writeBuffer(
      this.uniformBuffer!,
      0,
      u.buffer,
      0,
      UNIFORM_FLOATS * 4
    );

    // Refresh depth view only when the texture object itself changes
    if (this.cachedDepthTexture !== renderer.depthTexture) {
      this.cachedDepthTexture = renderer.depthTexture;
      this.cachedDepthView = renderer.depthTexture.createView();
    }

    // Update pre-allocated descriptor in place — no object allocation each frame
    this.colorAttachment.view = renderer.getCurrentTextureView();
    this.depthAttachment.view = this.cachedDepthView!;

    const enc = device.createCommandEncoder(this.encoderDesc);
    const pass = enc.beginRenderPass(this.renderPassDesc);

    pass.setPipeline(this.pipeline!);
    pass.setBindGroup(0, this.bindGroup!);

    // Main bolt
    if (this.mainVertCount > 0) {
      pass.setVertexBuffer(0, this.mainVB!);
      pass.draw(this.mainVertCount);
    }

    // Branches at reduced intensity — reuse same pipeline, override via branchScale uniform
    const branchCount = Math.min(strike.boltBranchCount, MAX_BRANCHES);
    for (let b = 0; b < branchCount; b++) {
      if (this.branchVertCounts[b] > 0) {
        pass.setVertexBuffer(0, this.branchVBs[b]);
        pass.draw(this.branchVertCounts[b]);
      }
    }

    pass.end();
    this.submitArr[0] = enc.finish();
    device.queue.submit(this.submitArr);
  }

  dispose(): void {
    this.uniformBuffer?.destroy();
    this.mainVB?.destroy();
    for (const vb of this.branchVBs) vb.destroy();
    this.branchVBs = [];
  }

  // ─────────────────────────────────────────────────────────────────────────

  private uploadPath(device: GPUDevice, strike: LightningStrike): void {
    const mainVertCount = this.buildSegmentVerts(
      strike.boltPath,
      strike.boltPathPtCount,
      this.mainStagingVerts
    );
    device.queue.writeBuffer(
      this.mainVB!,
      0,
      this.mainStagingVerts.buffer,
      0,
      mainVertCount * BYTES_PER_VERT
    );
    this.mainVertCount = mainVertCount;

    const branchCount = Math.min(strike.boltBranchCount, MAX_BRANCHES);
    for (let b = 0; b < MAX_BRANCHES; b++) this.branchVertCounts[b] = 0;
    for (let b = 0; b < branchCount; b++) {
      const bvc = this.buildSegmentVerts(
        strike.boltBranches[b],
        strike.boltBranchPtCounts[b],
        this.branchStagingVerts[b]
      );
      device.queue.writeBuffer(
        this.branchVBs[b],
        0,
        this.branchStagingVerts[b].buffer,
        0,
        bvc * BYTES_PER_VERT
      );
      this.branchVertCounts[b] = bvc;
    }
  }

  /**
   * Fill `out` with billboard segment vertices for `ptCount` path points.
   * Returns the number of vertices written. Zero-allocation.
   */
  private buildSegmentVerts(
    path: Float32Array,
    ptCount: number,
    out: Float32Array
  ): number {
    const numSegs = ptCount - 1;

    for (let i = 0; i < numSegs; i++) {
      const ax = path[i * 3],
        ay = path[i * 3 + 1],
        az = path[i * 3 + 2];
      const bx = path[(i + 1) * 3],
        by = path[(i + 1) * 3 + 1],
        bz = path[(i + 1) * 3 + 2];

      // All 6 vertices carry the same posA/posB (segment A and B endpoints).
      // isB selects which end this vertex sits at via mix(posA, posB, isB).
      let o = i * VERTS_PER_SEG * FLOATS_PER_VERT;

      // Triangle 1: A-left, A-right, B-right
      out[o] = ax;
      out[o + 1] = ay;
      out[o + 2] = az;
      out[o + 3] = bx;
      out[o + 4] = by;
      out[o + 5] = bz;
      out[o + 6] = 0;
      out[o + 7] = -1;
      o += FLOATS_PER_VERT;
      out[o] = ax;
      out[o + 1] = ay;
      out[o + 2] = az;
      out[o + 3] = bx;
      out[o + 4] = by;
      out[o + 5] = bz;
      out[o + 6] = 0;
      out[o + 7] = +1;
      o += FLOATS_PER_VERT;
      out[o] = ax;
      out[o + 1] = ay;
      out[o + 2] = az;
      out[o + 3] = bx;
      out[o + 4] = by;
      out[o + 5] = bz;
      out[o + 6] = 1;
      out[o + 7] = +1;
      o += FLOATS_PER_VERT;
      // Triangle 2: A-left, B-right, B-left
      out[o] = ax;
      out[o + 1] = ay;
      out[o + 2] = az;
      out[o + 3] = bx;
      out[o + 4] = by;
      out[o + 5] = bz;
      out[o + 6] = 0;
      out[o + 7] = -1;
      o += FLOATS_PER_VERT;
      out[o] = ax;
      out[o + 1] = ay;
      out[o + 2] = az;
      out[o + 3] = bx;
      out[o + 4] = by;
      out[o + 5] = bz;
      out[o + 6] = 1;
      out[o + 7] = +1;
      o += FLOATS_PER_VERT;
      out[o] = ax;
      out[o + 1] = ay;
      out[o + 2] = az;
      out[o + 3] = bx;
      out[o + 4] = by;
      out[o + 5] = bz;
      out[o + 6] = 1;
      out[o + 7] = -1;
    }

    return numSegs * VERTS_PER_SEG;
  }
}
