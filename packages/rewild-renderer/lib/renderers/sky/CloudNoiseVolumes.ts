import generatorShader from '../../shaders/sky/cloudNoiseVolumes.wgsl';

const DETAIL_SIZE = 64;
const WORKGROUP_SIZE = 4;

function mipCount(size: number): number {
  return Math.log2(size) + 1;
}

/**
 * Tiling 3D noise the cumulus erosion samples (cloudDensity.wgsl): a shape
 * volume of `shapeSize`³ and a 64³ detail volume, each with a full mip chain,
 * generated once on the GPU.
 */
export class CloudNoiseVolumes {
  readonly shape: GPUTexture;
  readonly detail: GPUTexture;

  /** @param shapeSize Edge of the shape volume; a power of two, at least 32. */
  constructor(device: GPUDevice, readonly shapeSize: number) {
    this.shape = this.createVolume(
      device,
      'cloud shape noise volume',
      shapeSize
    );
    this.detail = this.createVolume(
      device,
      'cloud detail noise volume',
      DETAIL_SIZE
    );

    const module = device.createShaderModule({
      label: 'cloud noise volumes',
      code: generatorShader,
    });
    const encoder = device.createCommandEncoder({
      label: 'cloud noise volumes',
    });
    const pass = encoder.beginComputePass({ label: 'cloud noise volumes' });

    for (const [entryPoint, texture, binding] of [
      ['generateShape', this.shape, 0],
      ['generateDetail', this.detail, 1],
    ] as const) {
      const pipeline = device.createComputePipeline({
        label: `cloud noise ${entryPoint}`,
        layout: 'auto',
        compute: { module, entryPoint },
      });
      const group = device.createBindGroup({
        label: `cloud noise ${entryPoint}`,
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding,
            resource: texture.createView({ baseMipLevel: 0, mipLevelCount: 1 }),
          },
        ],
      });
      const groups = Math.ceil(texture.width / WORKGROUP_SIZE);
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, group);
      pass.dispatchWorkgroups(groups, groups, groups);
    }

    const downsample = device.createComputePipeline({
      label: 'cloud noise downsample',
      layout: 'auto',
      compute: { module, entryPoint: 'downsample' },
    });
    pass.setPipeline(downsample);
    for (const texture of [this.shape, this.detail]) {
      for (let level = 1; level < texture.mipLevelCount; level++) {
        const group = device.createBindGroup({
          label: 'cloud noise downsample',
          layout: downsample.getBindGroupLayout(0),
          entries: [
            {
              binding: 2,
              resource: texture.createView({
                baseMipLevel: level - 1,
                mipLevelCount: 1,
              }),
            },
            {
              binding: 3,
              resource: texture.createView({
                baseMipLevel: level,
                mipLevelCount: 1,
              }),
            },
          ],
        });
        const groups = Math.ceil((texture.width >> level) / WORKGROUP_SIZE);
        pass.setBindGroup(0, group);
        pass.dispatchWorkgroups(groups, groups, groups);
      }
    }

    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  private createVolume(
    device: GPUDevice,
    label: string,
    size: number
  ): GPUTexture {
    return device.createTexture({
      label,
      size: [size, size, size],
      dimension: '3d',
      format: 'rgba8unorm',
      mipLevelCount: mipCount(size),
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  dispose(): void {
    this.shape.destroy();
    this.detail.destroy();
  }
}
