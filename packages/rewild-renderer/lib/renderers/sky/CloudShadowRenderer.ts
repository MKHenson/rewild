import { Renderer } from '../../Renderer';
import shader from '../../shaders/sky/cloudShadow.wgsl';
import constantsFns from '../../shaders/sky/skyConstants.wgsl';
import cloudNoiseFns from '../../shaders/sky/cloudNoise.wgsl';
import cloudDensityFns from '../../shaders/sky/cloudDensity.wgsl';
import { RenderQuality } from '../../utils/RenderQuality';
import { composeShader } from '../../utils/shaderDefines';
import { cloudShadowShaderDefines } from './SkyQuality';

export interface CloudShadowConfig {
  resolution: number;
  worldSize: number;
  updateFrequency: number;
}

const DEFAULT_CONFIG: CloudShadowConfig = {
  resolution: 1024,
  worldSize: 5000,
  updateFrequency: 6,
};

export class CloudShadowRenderer {
  /** Quality tier, read when init() builds the shader module. Assigned by
   *  SkyRenderer.init(); set `skyRenderer.quality` to change it. */
  quality: RenderQuality = 'high';

  shadowMap: GPUTexture;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  uniformData: Float32Array;
  config: CloudShadowConfig;
  private frameCounter: number = 0;

  constructor(config?: Partial<CloudShadowConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(renderer: Renderer): void {
    const { device } = renderer;
    const { resolution } = this.config;

    // The shadow map is sized from config.resolution, not the canvas, so a
    // re-init (window resize, quality change) does not need a new one — and
    // creating one anyway is actively harmful. Terrain materials bake a view of
    // this texture into their bind group once (ShadowUniforms.build), and
    // nothing tells them it was replaced. The pass below would then render into
    // the new texture while the terrain kept sampling the old one, which is
    // still alive and so raises no validation error: the cloud shadows simply
    // freeze mid-drift.
    //
    // The old texture is deliberately not destroyed on a genuine resolution
    // change: a bind group may still reference it for another frame (see the
    // identity check in ShadowUniforms.prepare, which rebuilds one frame later).
    // Leaking a 2 MB texture on a config change nobody makes at runtime beats a
    // use-after-destroy.
    if (!this.shadowMap || this.shadowMap.width !== resolution) {
      this.shadowMap = device.createTexture({
        size: [resolution, resolution, 1],
        format: 'r16float',
        label: 'cloud shadow map',
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
    }

    const module = device.createShaderModule({
      label: 'cloud shadow shader',
      code: composeShader(
        [shader, constantsFns, cloudNoiseFns, cloudDensityFns],
        cloudShadowShaderDefines(this.quality)
      ),
    });

    this.pipeline = device.createRenderPipeline({
      label: 'cloud shadow pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: [{ format: 'r16float' }],
      },
    });

    // Uniform buffer: 12 floats (CloudShadowUniforms struct)
    const uniformSize = 12 * 4;
    const alignedSize = Math.ceil(uniformSize / 16) * 16;
    this.uniformData = new Float32Array(alignedSize / 4);

    this.uniformBuffer = device.createBuffer({
      label: 'cloud shadow uniforms',
      size: alignedSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      label: 'cloud shadow bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: renderer.samplerManager.get('linear') },
        {
          binding: 2,
          resource: renderer.textureManager
            .get('rgba-noise-256')
            .gpuTexture.createView(),
        },
        {
          binding: 3,
          resource: renderer.textureManager
            .get('pebbles-512')
            .gpuTexture.createView(),
        },
      ],
    });
  }

  shouldUpdate(): boolean {
    this.frameCounter++;
    return this.frameCounter % this.config.updateFrequency === 0;
  }

  render(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    cameraX: number,
    cameraZ: number,
    iTime: number,
    cloudiness: number,
    windiness: number,
    sunDirX: number,
    sunDirY: number,
    sunDirZ: number,
    timestampWrites?: GPURenderPassTimestampWrites
  ): void {
    if (!this.shouldUpdate()) return;

    const data = this.uniformData;
    data[0] = this.config.worldSize;
    data[1] = cameraX;
    data[2] = cameraZ;
    data[3] = iTime;
    data[4] = cloudiness;
    data[5] = windiness;
    data[6] = sunDirX;
    data[7] = sunDirY;
    data[8] = sunDirZ;

    device.queue.writeBuffer(this.uniformBuffer, 0, data.buffer);

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.shadowMap.createView(),
          clearValue: [0.0, 0.0, 0.0, 1.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      timestampWrites,
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6);
    pass.end();
  }

  dispose(): void {
    if (this.shadowMap) {
      this.shadowMap.destroy();
    }
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
    }
  }
}
