import { Renderer } from '..';
import { ImageLoader } from './ImageLoader';
import { ITexture } from './ITexture';
import { getNumMipmaps, TextureProperties } from './Texture';

/**
 * A stack of same-sized images in one `texture_2d_array`, so a shader can pick
 * between them with a runtime `array_index` instead of needing a binding each.
 *
 * Layer order is the order of `src` and is the contract with the shader — the
 * caller owns that mapping.
 *
 * Every layer must share dimensions and format. That is a hard requirement of
 * array textures, not a simplification: one `createTexture` size covers the
 * whole stack. Mismatches throw at load rather than silently stretching or
 * cropping, because a wrong-sized layer is an authoring mistake that is very
 * hard to spot once it is filtered onto terrain.
 */
export class TextureArray implements ITexture {
  src: string[];
  gpuTexture: GPUTexture;
  properties: TextureProperties;

  constructor(properties: TextureProperties, src: string[]) {
    if (src.length === 0)
      throw new Error(
        `Texture array '${properties.name}' needs at least one layer.`
      );
    this.src = src;
    this.properties = properties;
  }

  async load(renderer: Renderer) {
    const { device } = renderer;
    const loader = await new ImageLoader().loadImages(this.src);
    const { maxWidth, maxHeight, images } = loader;

    // ImageLoader reports the max across the set; anything smaller would be
    // silently padded into its layer, so require exact agreement.
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      if (image.width !== maxWidth || image.height !== maxHeight) {
        throw new Error(
          `Texture array '${this.properties.name}' layer ${i} (${this.src[i]}) is ` +
            `${image.width}x${image.height}; every layer must be ${maxWidth}x${maxHeight}.`
        );
      }
    }

    this.gpuTexture = device.createTexture({
      label: `texture array '${this.properties.name}'`,
      size: {
        width: maxWidth,
        height: maxHeight,
        depthOrArrayLayers: images.length,
      },
      format: 'rgba8unorm',
      dimension: '2d',
      mipLevelCount: this.properties.generateMipmaps
        ? getNumMipmaps(maxWidth, maxHeight)
        : 1,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    for (let layer = 0; layer < images.length; layer++) {
      device.queue.copyExternalImageToTexture(
        { source: images[layer] },
        { texture: this.gpuTexture, origin: { x: 0, y: 0, z: layer } },
        { width: maxWidth, height: maxHeight }
      );

      // Mips are generated per layer — the generator renders through a single
      // -layer 2d view, since its shader cannot bind a 2d-array.
      if (this.gpuTexture.mipLevelCount > 1) {
        renderer.mipmapGenerator.generateMips(device, this.gpuTexture, layer);
      }
    }

    return this;
  }

  /**
   * A `2d` view of a single layer, bindable anywhere a plain `texture_2d` is
   * expected. Without an explicit dimension WebGPU would hand back a
   * `2d-array` view, which will not bind to a `texture_2d`.
   */
  createLayerView(layer: number): GPUTextureView {
    if (layer < 0 || layer >= this.src.length)
      throw new Error(
        `Texture array '${this.properties.name}' has ${this.src.length} layers; no layer ${layer}.`
      );

    return this.gpuTexture.createView({
      dimension: '2d',
      baseArrayLayer: layer,
      arrayLayerCount: 1,
    });
  }
}
