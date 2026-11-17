/**
 * Loads a distance field atlas image into a texture. The channels are
 * distances, not colours, so the image loads with no colour conversion.
 */
export async function loadAtlasTexture(
  device: GPUDevice,
  url: string,
  label: string
): Promise<GPUTexture> {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const texture = device.createTexture({
    label: `${label} ${url}`,
    size: [bitmap.width, bitmap.height],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [
    bitmap.width,
    bitmap.height,
  ]);
  bitmap.close();
  return texture;
}
