import { Renderer } from '../../Renderer';
import shader from '../../shaders/shadow-atlas-debug.wgsl';

export class ShadowDebugRenderer {
  enabled: boolean = false;
  private pipeline: GPURenderPipeline | null = null;
  private bindGroup: GPUBindGroup | null = null;

  init(renderer: Renderer, shadowAtlas: GPUTexture): void {
    const { device, presentationFormat } = renderer;

    const module = device.createShaderModule({
      label: 'shadow atlas debug shader',
      code: shader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'shadow atlas debug pipeline',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: presentationFormat }],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: shadowAtlas.createView({ aspect: 'depth-only' }) },
      ],
    });
  }

  render(renderer: Renderer): void {
    if (!this.enabled || !this.pipeline || !this.bindGroup) return;

    const encoder = renderer.device.createCommandEncoder({ label: 'shadow debug encoder' });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: renderer.getCurrentTextureView(),
        loadOp: 'load',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6);
    pass.end();
    renderer.device.queue.submit([encoder.finish()]);
  }
}
