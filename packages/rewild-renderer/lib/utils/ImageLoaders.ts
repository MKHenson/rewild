export async function loadImageBitmap(
  url: string,
  colorSpaceConversion: ColorSpaceConversion = 'none'
) {
  const res = await fetch(url);
  const blob = await res.blob();
  return await createImageBitmap(blob, { colorSpaceConversion });
}

export function numMipLevels(...sizes: number[]): number {
  const maxSize = Math.max(...sizes);
  return (1 + Math.log2(maxSize)) | 0;
}

export function createTextureFromSource(
  device: GPUDevice,
  source: ImageBitmap | HTMLCanvasElement,
  format: GPUTextureFormat = 'rgba8unorm',
  generateMips: boolean = true,
  flipY: boolean = true
): GPUTexture {
  const texture = device.createTexture({
    format,
    mipLevelCount: generateMips ? numMipLevels(source.width, source.height) : 1,
    size: [source.width, source.height],
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.copyExternalImageToTexture(
    { source, flipY },
    { texture },
    { width: source.width, height: source.height }
  );

  return texture;
}
