import { Color, Matrix4 } from 'rewild-common';
import { Camera } from '../../core/Camera';
import type { PortalPass } from '../../materials/PortalPass';
import { Renderer } from '../../Renderer';
import { IFrameEffect } from '../../post-processes/IFrameEffect';
import shader from '../../shaders/portal-spark.wgsl';
import { ARC_POINTS, BRANCH_POINTS, MAX_ARCS, PortalArcs } from './PortalArcs';

/** Segments drawn in a frame, across every portal. */
const MAX_SEGMENTS = 512;
const VERTS_PER_SEGMENT = 6;
// posA xyz, posB xyz, isB, side, brightness, halfWidth, tint rgb.
const VERTEX_FLOATS = 13;
const UNIFORM_FLOATS = 24;
/** A branch's brightness and width as a share of its bolt's. */
const BRANCH_SHARE = 0.6;
/** A bolt's half width, in portal radii. */
const ARC_HALF_WIDTH = 0.02;

// isB and side of a segment's six vertices: two triangles across it.
// prettier-ignore
const CORNERS = [
  0, -1,   0, 1,   1, 1,
  0, -1,   1, 1,   1, -1,
];

/**
 * Draws the lightning of the portals in view onto the composited frame, after
 * the portal lens so it stays crisp, and before the tonemap. A frame without
 * any costs nothing.
 */
export class PortalSparks implements IFrameEffect {
  private readonly vertices = new Float32Array(
    MAX_SEGMENTS * VERTS_PER_SEGMENT * VERTEX_FLOATS
  );
  private readonly uniforms = new Float32Array(UNIFORM_FLOATS);
  private readonly viewProjection = new Matrix4();
  private segments = 0;
  private pipeline: GPURenderPipeline | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private group: GPUBindGroup | null = null;
  private depthTexture: GPUTexture | null = null;
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
  private readonly passDescriptor: GPURenderPassDescriptor = {
    label: 'portal sparks',
    colorAttachments: [this.colorAttachment],
    depthStencilAttachment: this.depthAttachment,
  };
  private readonly submissions: GPUCommandBuffer[] = [];

  /** `portals` is the renderer's list, read each frame. */
  constructor(private readonly portals: readonly PortalPass[]) {}

  // Writes the live bolts of `arcs`, as ribbons `halfWidth` wide each side.
  private addArcs(arcs: PortalArcs, tint: Color, halfWidth: number): void {
    for (let i = 0; i < MAX_ARCS; i++) {
      const brightness = arcs.brightness[i];
      if (brightness <= 0) continue;
      this.addPath(
        arcs.paths,
        i * ARC_POINTS,
        ARC_POINTS,
        brightness,
        halfWidth,
        tint
      );
      this.addPath(
        arcs.branches,
        i * BRANCH_POINTS,
        BRANCH_POINTS,
        brightness * BRANCH_SHARE,
        halfWidth * BRANCH_SHARE,
        tint
      );
    }
  }

  render(
    renderer: Renderer,
    camera: Camera,
    scene: GPUTexture,
    sceneView: GPUTextureView
  ): void {
    this.segments = 0;
    for (let i = 0; i < this.portals.length; i++) {
      const portal = this.portals[i];
      if (portal.inView)
        this.addArcs(
          portal.arcs,
          portal.portal.tint,
          portal.radius * ARC_HALF_WIDTH
        );
    }
    const segments = this.segments;
    if (segments === 0) return;

    const { device } = renderer;
    this.prepare(renderer);

    this.viewProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    const u = this.uniforms;
    u.set(this.viewProjection.elements, 0);
    const world = camera.transform.matrixWorld.elements;
    u[16] = world[12];
    u[17] = world[13];
    u[18] = world[14];
    u[19] = camera.exposure;
    u[20] = 2 / (camera.projectionMatrix.elements[5] * scene.height);
    device.queue.writeBuffer(this.uniformBuffer!, 0, u);

    const vertexCount = segments * VERTS_PER_SEGMENT;
    device.queue.writeBuffer(
      this.vertexBuffer!,
      0,
      this.vertices,
      0,
      vertexCount * VERTEX_FLOATS
    );

    if (this.depthTexture !== renderer.depthTexture) {
      this.depthTexture = renderer.depthTexture;
      this.depthAttachment.view = renderer.depthTexture.createView();
    }
    this.colorAttachment.view = sceneView;

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass(this.passDescriptor);
    pass.setPipeline(this.pipeline!);
    pass.setBindGroup(0, this.group!);
    pass.setVertexBuffer(0, this.vertexBuffer!);
    pass.draw(vertexCount);
    pass.end();
    this.submissions[0] = encoder.finish();
    device.queue.submit(this.submissions);
  }

  dispose(): void {
    this.vertexBuffer?.destroy();
    this.uniformBuffer?.destroy();
    this.vertexBuffer = null;
    this.uniformBuffer = null;
    this.pipeline = null;
    this.group = null;
    this.depthTexture = null;
  }

  // Writes a ribbon segment for each step along `count` points of `points`,
  // starting at point `first`.
  private addPath(
    points: Float32Array,
    first: number,
    count: number,
    brightness: number,
    halfWidth: number,
    tint: Color
  ): void {
    const v = this.vertices;
    for (let k = 0; k < count - 1; k++) {
      if (this.segments >= MAX_SEGMENTS) return;
      const a = (first + k) * 3;
      let o = this.segments * VERTS_PER_SEGMENT * VERTEX_FLOATS;
      for (let c = 0; c < VERTS_PER_SEGMENT; c++) {
        v[o] = points[a];
        v[o + 1] = points[a + 1];
        v[o + 2] = points[a + 2];
        v[o + 3] = points[a + 3];
        v[o + 4] = points[a + 4];
        v[o + 5] = points[a + 5];
        v[o + 6] = CORNERS[c * 2];
        v[o + 7] = CORNERS[c * 2 + 1];
        v[o + 8] = brightness;
        v[o + 9] = halfWidth;
        v[o + 10] = tint.r;
        v[o + 11] = tint.g;
        v[o + 12] = tint.b;
        o += VERTEX_FLOATS;
      }
      this.segments++;
    }
  }

  private prepare(renderer: Renderer): void {
    if (this.pipeline) return;
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({
      label: 'portal sparks',
      code: shader,
    });
    this.pipeline = device.createRenderPipeline({
      label: 'portal sparks',
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: VERTEX_FLOATS * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32' },
              { shaderLocation: 3, offset: 28, format: 'float32' },
              { shaderLocation: 4, offset: 32, format: 'float32' },
              { shaderLocation: 5, offset: 36, format: 'float32' },
              { shaderLocation: 6, offset: 40, format: 'float32x3' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format: sceneColorFormat,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      multisample: { count: renderer.sampleCount },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less',
      },
    });
    this.vertexBuffer = device.createBuffer({
      label: 'portal sparks vertices',
      size: this.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.uniformBuffer = device.createBuffer({
      label: 'portal sparks uniforms',
      size: UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.group = device.createBindGroup({
      label: 'portal sparks',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }
}
