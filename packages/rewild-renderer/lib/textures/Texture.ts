export class TextureProperties {
  constructor(public name: string, public generateMipmaps: boolean = true) {}
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
