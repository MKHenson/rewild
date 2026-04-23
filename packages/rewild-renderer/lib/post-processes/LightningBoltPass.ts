import { Renderer } from '../Renderer';
import boltShader from '../shaders/lightningBolt.wgsl';
import type { LightningStrike } from '../renderers/sky/LightningController';

// ── Uniform layout (96 bytes, aligned to 256) ─────────────────────────────
//  [0..15]  viewProjMatrix  mat4x4  (64 bytes, f32 indices 0-15)
//  [16..18] cameraPosition  vec3    (12 bytes, f32 indices 16-18)
//  [19]     halfWidth       f32     ( 4 bytes)
//  [20]     intensity       f32     ( 4 bytes)
//  [21]     branchScale     f32     ( 4 bytes)
//  [22..23] _pad            vec2    ( 8 bytes)
const UNIFORM_FLOATS = 24;

// ── Per-vertex layout, arrayStride 32 bytes ───────────────────────────────
//  offset  0: posA  float32x3  (12 bytes)
//  offset 12: posB  float32x3  (12 bytes)
//  offset 24: isB   float32    ( 4 bytes)  0 = A-end, 1 = B-end
//  offset 28: side  float32    ( 4 bytes)  -1 or +1
const FLOATS_PER_VERT  = 8;
const BYTES_PER_VERT   = FLOATS_PER_VERT * 4;
const VERTS_PER_SEG    = 6;

// Pre-allocate vertex buffers for worst-case bolt size (256 segments main + 3×64 branch)
const MAX_MAIN_SEGS   = 256;
const MAX_BRANCH_SEGS = 64;
const MAX_BRANCHES    = 3;

export class LightningBoltPass {
  private pipeline:       GPURenderPipeline | null = null;
  private uniformBuffer:  GPUBuffer | null = null;
  private mainVB:         GPUBuffer | null = null;
  private branchVBs:      GPUBuffer[] = [];
  private bindGroup:      GPUBindGroup | null = null;

  private uniformData = new Float32Array(64); // 256 bytes
  private mainVertCount   = 0;
  private branchVertCounts: number[] = [];

  init(renderer: Renderer): void {
    const { device } = renderer;

    const module = device.createShaderModule({
      label: 'lightning bolt shader',
      code:  boltShader,
    });

    this.uniformBuffer = device.createBuffer({
      label: 'lightning bolt uniforms',
      size:  256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.mainVB = device.createBuffer({
      label: 'lightning bolt main vertex buffer',
      size:  MAX_MAIN_SEGS * VERTS_PER_SEG * BYTES_PER_VERT,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    for (let b = 0; b < MAX_BRANCHES; b++) {
      this.branchVBs.push(device.createBuffer({
        label: `lightning bolt branch ${b} vertex buffer`,
        size:  MAX_BRANCH_SEGS * VERTS_PER_SEG * BYTES_PER_VERT,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      }));
    }

    this.pipeline = device.createRenderPipeline({
      label:  'lightning bolt pipeline',
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: BYTES_PER_VERT,
          attributes: [
            { shaderLocation: 0, offset:  0, format: 'float32x3' }, // posA
            { shaderLocation: 1, offset: 12, format: 'float32x3' }, // posB
            { shaderLocation: 2, offset: 24, format: 'float32'   }, // isB
            { shaderLocation: 3, offset: 28, format: 'float32'   }, // side
          ],
        }],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{
          format: renderer.presentationFormat,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one',                 operation: 'add' },
            alpha: { srcFactor: 'one',       dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive:    { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format:            'depth24plus',
        depthWriteEnabled: false,
        depthCompare:      'less',
      },
    });

    this.bindGroup = device.createBindGroup({
      label:  'lightning bolt bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
      ],
    });
  }

  render(
    renderer:      Renderer,
    strike:        LightningStrike,
    viewProjMatrix: Float32Array,
    cameraPos:     [number, number, number],
  ): void {
    if (!strike.boltVisible || !strike.boltPath || !this.pipeline) return;

    const device = renderer.device;

    // Upload geometry for the new strike
    this.uploadPath(device, strike);

    // Write uniforms
    const u = this.uniformData;
    u.set(viewProjMatrix, 0);          // viewProjMatrix  (f32 0-15)
    u[16] = cameraPos[0];              // cameraPosition
    u[17] = cameraPos[1];
    u[18] = cameraPos[2];
    u[19] = 8.0;                       // halfWidth in world units
    u[20] = strike.boltIntensity;      // intensity
    u[21] = 0.4;                       // branchScale (branches at 40% intensity)
    device.queue.writeBuffer(this.uniformBuffer!, 0, u.buffer, 0, UNIFORM_FLOATS * 4);

    // Render pass that reads existing depth — bolt occluded by terrain
    const enc  = device.createCommandEncoder({ label: 'lightning bolt' });
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

    pass.setPipeline(this.pipeline!);
    pass.setBindGroup(0, this.bindGroup!);

    // Main bolt
    if (this.mainVertCount > 0) {
      pass.setVertexBuffer(0, this.mainVB!);
      pass.draw(this.mainVertCount);
    }

    // Branches at reduced intensity — reuse same pipeline, override via branchScale uniform
    for (let b = 0; b < Math.min(strike.boltBranches.length, MAX_BRANCHES); b++) {
      if (this.branchVertCounts[b] > 0) {
        pass.setVertexBuffer(0, this.branchVBs[b]);
        pass.draw(this.branchVertCounts[b]);
      }
    }

    pass.end();
    device.queue.submit([enc.finish()]);
  }

  dispose(): void {
    this.uniformBuffer?.destroy();
    this.mainVB?.destroy();
    for (const vb of this.branchVBs) vb.destroy();
    this.branchVBs = [];
  }

  // ─────────────────────────────────────────────────────────────────────────

  private uploadPath(device: GPUDevice, strike: LightningStrike): void {
    const mainVerts = this.buildSegmentVerts(strike.boltPath!);
    const mainBytes = mainVerts.byteLength;
    device.queue.writeBuffer(this.mainVB!, 0, mainVerts.buffer, 0, mainBytes);
    this.mainVertCount = mainVerts.length / FLOATS_PER_VERT;

    this.branchVertCounts = [];
    for (let b = 0; b < Math.min(strike.boltBranches.length, MAX_BRANCHES); b++) {
      const bVerts = this.buildSegmentVerts(strike.boltBranches[b]);
      device.queue.writeBuffer(this.branchVBs[b], 0, bVerts.buffer, 0, bVerts.byteLength);
      this.branchVertCounts.push(bVerts.length / FLOATS_PER_VERT);
    }
  }

  /** Convert a flat Float32Array of vec3 path points into billboard segment vertices. */
  private buildSegmentVerts(path: Float32Array): Float32Array {
    const numPts  = path.length / 3;
    const numSegs = numPts - 1;
    const verts   = new Float32Array(numSegs * VERTS_PER_SEG * FLOATS_PER_VERT);

    for (let i = 0; i < numSegs; i++) {
      const ax = path[i * 3],     ay = path[i * 3 + 1],     az = path[i * 3 + 2];
      const bx = path[(i+1)*3],   by = path[(i+1)*3 + 1],   bz = path[(i+1)*3 + 2];

      const base = i * VERTS_PER_SEG * FLOATS_PER_VERT;
      const put  = (vi: number, px: number, py: number, pz: number,
                                qx: number, qy: number, qz: number,
                                isB: number, side: number) => {
        const o = base + vi * FLOATS_PER_VERT;
        verts[o]   = px; verts[o+1] = py; verts[o+2] = pz;
        verts[o+3] = qx; verts[o+4] = qy; verts[o+5] = qz;
        verts[o+6] = isB; verts[o+7] = side;
      };

      // All 6 vertices carry the same posA/posB (segment A and B endpoints).
      // isB selects which end this vertex sits at via mix(posA, posB, isB).
      // Triangle 1: A-left, A-right, B-right
      put(0, ax, ay, az, bx, by, bz, 0, -1);
      put(1, ax, ay, az, bx, by, bz, 0, +1);
      put(2, ax, ay, az, bx, by, bz, 1, +1);
      // Triangle 2: A-left, B-right, B-left
      put(3, ax, ay, az, bx, by, bz, 0, -1);
      put(4, ax, ay, az, bx, by, bz, 1, +1);
      put(5, ax, ay, az, bx, by, bz, 1, -1);
    }

    return verts;
  }
}
