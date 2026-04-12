import { Renderer } from '../../Renderer';
import shader from '../../shaders/atmosphere/cloudShadow.wgsl';
import constantsFns from '../../shaders/atmosphere/constants.wgsl';
import cloudNoiseFns from '../../shaders/atmosphere/cloudNoise.wgsl';
import cloudDensityFns from '../../shaders/atmosphere/cloudDensity.wgsl';

export interface CloudShadowConfig {
  resolution: number;
  worldSize: number;
  updateFrequency: number;
}

const DEFAULT_CONFIG: CloudShadowConfig = {
  resolution: 1024,
  worldSize: 5000,
  updateFrequency: 2,
};

export class CloudShadowRenderer {
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

    this.shadowMap = device.createTexture({
      size: [resolution, resolution, 1],
      format: 'r16float',
      label: 'cloud shadow map',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    const module = device.createShaderModule({
      label: 'cloud shadow shader',
      code: shader + constantsFns + cloudNoiseFns + cloudDensityFns,
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
