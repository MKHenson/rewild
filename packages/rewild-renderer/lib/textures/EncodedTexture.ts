import { Renderer } from '..';
import { decodeImageBytes } from './ImageLoader';
import { ITexture } from './ITexture';
import { getNumMipmaps, rgba8FormatFor, TextureProperties } from './Texture';

/**
 * A texture built from encoded image bytes rather than a URL — what a GLB
 * carries, since its images live in a buffer view with no address of their own.
 *
 * The bytes stay encoded until `load`, which is what lets the importer identify
 * an image by hashing them: two models embedding the same PNG produce the same
 * hash and share one of these.
 */
export class EncodedTexture implements ITexture {
  properties: TextureProperties;
  bytes: Uint8Array;
  mimeType?: string;
  gpuTexture: GPUTexture;

  constructor(
    properties: TextureProperties,
    bytes: Uint8Array,
    mimeType?: string
  ) {
    this.properties = properties;
    this.bytes = bytes;
    this.mimeType = mimeType;
  }

  async load(renderer: Renderer) {
    const { device } = renderer;
    const bitmap = await decodeImageBytes(this.bytes, this.mimeType);

    this.gpuTexture = device.createTexture({
      label: this.properties.name,
      size: {
        width: bitmap.width,
        height: bitmap.height,
        depthOrArrayLayers: 1,
      },
      format: rgba8FormatFor(this.properties.colorSpace),
      dimension: '2d',
      mipLevelCount: this.properties.generateMipmaps
        ? getNumMipmaps(bitmap.width, bitmap.height)
        : 1,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture: this.gpuTexture },
      [bitmap.width, bitmap.height]
    );

    if (this.gpuTexture.mipLevelCount > 1)
      renderer.mipmapGenerator.generateMips(device, this.gpuTexture);

    // The copy is complete by the time the queue call returns, and a decoded
    // 4K bitmap is 64MB of pixels the GC has no reason to hurry over.
    bitmap.close();

    return this;
  }
}
