import shader from '../../shaders/refraction-capture.wgsl';
import { Camera } from '../../core/Camera';

const FORMAT: GPUTextureFormat = 'rgba16float';

/**
 * The opaque scene, copied once a frame between the opaque and water passes
 * for water to refract: rgb the HDR colour, a the view depth in metres. Water
 * reads it with textureLoad, so a sample that lands in front of the water can
 * be told apart and rejected.
 */
export class RefractionCapture {
  private _texture: GPUTexture | null = null;
  private view: GPUTextureView | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private params: GPUBuffer | null = null;
  private paramsData = new Float32Array(16);
  private bindGroup: GPUBindGroup | null = null;
  private boundColor: GPUTexture | null = null;
  private boundDepth: GPUTexture | null = null;

  /** The capture; replaced when the scene targets are resized. */
  get texture(): GPUTexture | null {
    return this._texture;
  }

  /**
   * Copies `color` and `depth`, the opaque scene's targets, into the capture.
   * Encode it after the opaque pass ends and before the water draws.
   */
  capture(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    color: GPUTexture,
    depth: GPUTexture,
    camera: Camera,
    timestampWrites?: GPURenderPassTimestampWrites
  ): void {
    this.prepare(device, color, depth);
    this.paramsData.set(camera.projectionMatrixInverse.elements);
    device.queue.writeBuffer(this.params!, 0, this.paramsData);

    const pass = encoder.beginRenderPass({
      label: 'refraction capture',
      colorAttachments: [
        { view: this.view!, loadOp: 'clear', storeOp: 'store' },
      ],
      timestampWrites,
    });
    pass.setPipeline(this.pipeline!);
    pass.setBindGroup(0, this.bindGroup!);
    pass.draw(3);
    pass.end();
  }

  dispose(): void {
    this._texture?.destroy();
    this.params?.destroy();
    this._texture = null;
    this.view = null;
    this.params = null;
    this.bindGroup = null;
    this.boundColor = null;
    this.boundDepth = null;
  }

  private prepare(device: GPUDevice, color: GPUTexture, depth: GPUTexture) {
    if (!this.pipeline) {
      const module = device.createShaderModule({ code: shader });
      this.pipeline = device.createRenderPipeline({
        label: 'refraction capture pipeline',
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: FORMAT }] },
        primitive: { topology: 'triangle-list' },
      });
      this.params = device.createBuffer({
        label: 'refraction capture params',
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    if (
      !this._texture ||
      this._texture.width !== color.width ||
      this._texture.height !== color.height
    ) {
      this._texture?.destroy();
      this._texture = device.createTexture({
        label: 'refraction capture',
        size: [color.width, color.height],
        format: FORMAT,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      this.view = this._texture.createView();
    }

    if (color !== this.boundColor || depth !== this.boundDepth) {
      this.bindGroup = device.createBindGroup({
        label: 'refraction capture',
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: color.createView() },
          { binding: 1, resource: depth.createView() },
          { binding: 2, resource: { buffer: this.params! } },
        ],
      });
      this.boundColor = color;
      this.boundDepth = depth;
    }
  }
}
