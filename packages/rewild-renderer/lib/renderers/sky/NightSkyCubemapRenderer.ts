import { Renderer } from '../../Renderer';
import nightSkyShader from '../../shaders/atmosphere/nightSky.wgsl';

const CUBEMAP_SIZE = 1024;

export class NightSkyCubemapRenderer {
  cubemap: GPUTexture;
  private initialized = false;

  init(renderer: Renderer): void {
    if (this.initialized) return;
    this.initialized = true;

    const { device } = renderer;

    // Create cubemap texture (512x512x6 faces, half-float for HDR star values)
    this.cubemap = device.createTexture({
      size: [CUBEMAP_SIZE, CUBEMAP_SIZE, 6],
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      label: 'night sky cubemap',
    });

    const module = device.createShaderModule({
      code: nightSkyShader,
      label: 'night sky cubemap shader',
    });

    const pipeline = device.createRenderPipeline({
      label: 'Night Sky Cubemap Pipeline',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: 'rgba16float' }],
      },
    });

    // Render all 6 cubemap faces
    const encoder = device.createCommandEncoder({
      label: 'Night Sky Cubemap Encoder',
    });

    for (let face = 0; face < 6; face++) {
      const buffer = device.createBuffer({
        size: 256,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: `night sky face ${face} uniforms`,
      });

      // Write face index (u32) and face size (f32)
      const data = new ArrayBuffer(8);
      new Uint32Array(data, 0, 1)[0] = face;
      new Float32Array(data, 4, 1)[0] = CUBEMAP_SIZE;
      device.queue.writeBuffer(buffer, 0, data);

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer } }],
      });

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.cubemap.createView({
              dimension: '2d',
              baseArrayLayer: face,
              arrayLayerCount: 1,
            }),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: [0, 0, 0, 1],
          },
        ],
      });

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
      pass.end();
    }

    device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    if (this.cubemap) {
      this.cubemap.destroy();
    }
  }
}
