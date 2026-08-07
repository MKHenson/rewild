import { Renderer } from '../../Renderer';
import nightSkyShader from '../../shaders/sky/starfield.wgsl';

const CUBEMAP_SIZE = 1024;

/** 1024, 512, ... 1. */
const CUBEMAP_MIP_COUNT = Math.log2(CUBEMAP_SIZE) + 1;

export class StarfieldRenderer {
  cubemap: GPUTexture;
  private initialized = false;

  init(renderer: Renderer): void {
    if (this.initialized) return;
    this.initialized = true;

    const { device } = renderer;

    // Create cubemap texture (1024x1024x6 faces, half-float for HDR star values)
    //
    // The mip chain is not for the screen pass, which always reads level 0 and
    // wants every star it can get. It exists for SkyCubeCapture, which resamples
    // this cube onto a 128-a-side face — a 3-level reduction. Without a chain
    // the only level it could read is 0, and a single bilinear tap across 64
    // source texels is a point sample of a field whose features (noise at
    // `500.0 * dir`, so ~0.115 degrees) are already at texel scale. That
    // discards ~63 of every 64 stars and makes which ones survive a function of
    // sub-texel sampling phase, so the slow star rotation makes them flare and
    // pop rather than drift. See starCaptureLod() in SkyCubeCapture.
    this.cubemap = device.createTexture({
      size: [CUBEMAP_SIZE, CUBEMAP_SIZE, 6],
      format: 'rgba16float',
      mipLevelCount: CUBEMAP_MIP_COUNT,
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
            // mipLevelCount is mandatory now the texture has a chain: a render
            // attachment view must resolve to exactly one mip level.
            view: this.cubemap.createView({
              dimension: '2d',
              baseMipLevel: 0,
              mipLevelCount: 1,
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

    // One call per face: generateMips binds a single-layer `2d` view, because a
    // layered texture's default view is `2d-array` and will not bind to the
    // generator's `texture_2d<f32>`. Submitted after the faces above, and the
    // queue is ordered, so every level reads finished content.
    //
    // The chain is box-filtered per face rather than across the cube, so a mip
    // texel within one texel of a face edge averages clamped neighbours instead
    // of wrapping onto the adjacent face. At the level the capture reads that is
    // a handful of texels on a seam of a term that is itself convolved into
    // ambient afterwards.
    for (let face = 0; face < 6; face++) {
      renderer.mipmapGenerator.generateMips(device, this.cubemap, face);
    }
  }

  dispose(): void {
    if (this.cubemap) {
      this.cubemap.destroy();
    }
  }
}
