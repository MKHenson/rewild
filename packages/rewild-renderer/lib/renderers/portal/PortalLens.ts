import { Camera } from '../../core/Camera';
import type { PortalPass } from '../../materials/PortalPass';
import { Renderer } from '../../Renderer';
import { IFrameEffect } from '../../post-processes/IFrameEffect';
import shader from '../../shaders/portal-lens.wgsl';
import vertexScreenQuadShader from '../../shaders/utils/vertexScreenQuad.wgsl';

const MAX_PORTALS = 4;
const PORTALS_OFFSET = 36;
const GLOWS_OFFSET = PORTALS_OFFSET + MAX_PORTALS * 4;
const PARAMS_FLOATS = GLOWS_OFFSET + MAX_PORTALS * 4;

/**
 * Bends the composited frame around the portals in view, up to MAX_PORTALS of
 * them. A frame with none in view costs nothing.
 */
export class PortalLens implements IFrameEffect {
  private data = new Float32Array(PARAMS_FLOATS);
  private frame: GPUTexture | null = null;
  private params: GPUBuffer | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private group: GPUBindGroup | null = null;
  private boundDepth: GPUTexture | null = null;
  private readonly colorAttachment: GPURenderPassColorAttachment = {
    view: null as unknown as GPUTextureView,
    loadOp: 'load',
    storeOp: 'store',
  };
  private readonly passDescriptor: GPURenderPassDescriptor = {
    label: 'portal lens',
    colorAttachments: [this.colorAttachment],
  };
  private readonly copySource: GPUImageCopyTexture = {
    texture: null as unknown as GPUTexture,
  };
  private readonly copyDestination: GPUImageCopyTexture = {
    texture: null as unknown as GPUTexture,
  };
  private readonly copySize = [0, 0];
  private readonly submissions: GPUCommandBuffer[] = [];

  /** `portals` is the renderer's list, read each frame. */
  constructor(private readonly portals: readonly PortalPass[]) {}

  render(
    renderer: Renderer,
    camera: Camera,
    scene: GPUTexture,
    sceneView: GPUTextureView
  ): void {
    if (renderer.sampleCount > 1) return;
    const count = this.gather(camera);
    if (count === 0) return;

    const { device } = renderer;
    this.prepare(renderer, scene);

    const d = this.data;
    d.set(camera.projectionMatrix.elements, 0);
    d.set(camera.projectionMatrixInverse.elements, 16);
    d[32] = scene.width;
    d[33] = scene.height;
    d[34] = count;
    d[35] = camera.exposure;
    device.queue.writeBuffer(this.params!, 0, d);

    this.copySource.texture = scene;
    this.copyDestination.texture = this.frame!;
    this.copySize[0] = scene.width;
    this.copySize[1] = scene.height;
    this.colorAttachment.view = sceneView;

    const encoder = device.createCommandEncoder();
    encoder.copyTextureToTexture(
      this.copySource,
      this.copyDestination,
      this.copySize
    );
    const pass = encoder.beginRenderPass(this.passDescriptor);
    pass.setPipeline(this.pipeline!);
    pass.setBindGroup(0, this.group!);
    pass.draw(6);
    pass.end();
    this.submissions[0] = encoder.finish();
    device.queue.submit(this.submissions);
  }

  // Writes the portals in view, in view space, into the params. Returns how many.
  private gather(camera: Camera): number {
    const d = this.data;
    const v = camera.matrixWorldInverse.elements;
    let count = 0;
    for (let i = 0; i < this.portals.length && count < MAX_PORTALS; i++) {
      const portal = this.portals[i];
      if (!portal.inView) continue;
      const x = portal.centreX;
      const y = portal.centreY;
      const z = portal.centreZ;
      const o = PORTALS_OFFSET + count * 4;
      d[o] = v[0] * x + v[4] * y + v[8] * z + v[12];
      d[o + 1] = v[1] * x + v[5] * y + v[9] * z + v[13];
      d[o + 2] = v[2] * x + v[6] * y + v[10] * z + v[14];
      d[o + 3] = portal.radius;
      const tint = portal.portal.tint;
      const glow = portal.portal.glow;
      const g = GLOWS_OFFSET + count * 4;
      d[g] = tint.r * glow;
      d[g + 1] = tint.g * glow;
      d[g + 2] = tint.b * glow;
      count++;
    }
    return count;
  }

  dispose(): void {
    this.frame?.destroy();
    this.params?.destroy();
    this.frame = null;
    this.params = null;
    this.pipeline = null;
    this.group = null;
    this.boundDepth = null;
  }

  // Makes the pipeline once, and the frame copy and group whenever the scene
  // or depth target is replaced.
  private prepare(renderer: Renderer, scene: GPUTexture): void {
    const { device, sceneColorFormat } = renderer;
    if (!this.pipeline)
      this.pipeline = device.createRenderPipeline({
        label: 'portal lens',
        layout: 'auto',
        vertex: {
          module: device.createShaderModule({ code: vertexScreenQuadShader }),
          entryPoint: 'vs',
        },
        fragment: {
          module: device.createShaderModule({
            label: 'portal lens',
            code: shader,
          }),
          entryPoint: 'fs',
          targets: [{ format: sceneColorFormat }],
        },
      });
    if (!this.params)
      this.params = device.createBuffer({
        label: 'portal lens params',
        size: PARAMS_FLOATS * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

    const sized =
      this.frame?.width === scene.width && this.frame?.height === scene.height;
    if (sized && this.boundDepth === renderer.depthTexture) return;

    if (!sized) {
      this.frame?.destroy();
      this.frame = device.createTexture({
        label: 'portal lens frame',
        size: [scene.width, scene.height],
        format: scene.format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
    }

    this.boundDepth = renderer.depthTexture;
    this.group = device.createBindGroup({
      label: 'portal lens',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: this.frame!.createView() },
        {
          binding: 2,
          resource: renderer.samplerManager.get('linear-clamped'),
        },
        { binding: 3, resource: renderer.depthTexture.createView() },
      ],
    });
  }
}
