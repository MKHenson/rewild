/**
 * How a texture's stored bytes encode their values.
 *
 * `srgb` — the file holds sRGB-encoded colour: albedo, emissive, skyboxes,
 * anything an artist picked by eye. Sampling has to decode it before the value
 * can be used in any lighting maths.
 *
 * `linear` — the bytes *are* the value: normal, roughness, metallic, AO,
 * height, splat weights, noise, MSDF distances. Decoding these corrupts them.
 *
 * Defaults to `linear`, because a texture built in code is nearly always data.
 * Loaded image assets are the other way round, so `materials.json` requires the
 * field rather than defaulting it — see `IMaterialsTemplate`.
 */
export type TextureColorSpace = 'srgb' | 'linear';

export class TextureProperties {
  constructor(
    public name: string,
    public generateMipmaps: boolean = true,
    public colorSpace: TextureColorSpace = 'linear'
  ) {}
}

/**
 * The 8-bit RGBA format that carries `colorSpace`.
 *
 * In WebGPU sRGB is a property of the *format*, not of the sampler or the
 * shader: an `-srgb` format decodes to linear on every sample and re-encodes on
 * every render-target write. So declaring it here is the entire fix, and it
 * also gets mip generation right for free — `MipMapGenerator` renders each
 * level through this same format, so it averages decoded linear values instead
 * of averaging the encoding.
 */
export function rgba8FormatFor(
  colorSpace: TextureColorSpace
): GPUTextureFormat {
  return colorSpace === 'srgb' ? 'rgba8unorm-srgb' : 'rgba8unorm';
}

export function getNumMipmapsOld(
  w: number,
  h: number,
  generateMipmaps: boolean
) {
  if (generateMipmaps) {
    const mipMaps = Math.round(Math.log2(Math.max(w, h)));
    if (mipMaps > 10) return 11;
    return mipMaps + 1;
  }

  return 1;
}

export function getNumMipmaps(...sizes: number[]): number {
  const maxSize = Math.max(...sizes);
  return (1 + Math.log2(maxSize)) | 0;
}
