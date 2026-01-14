import { KerningMap, MsdfChar } from '../../types/interfaces';

export class MsdfFont {
  charCount: number;
  defaultChar: MsdfChar;
  pageTextures: GPUTexture[];

  constructor(
    pageTextures: GPUTexture[],
    public charsBuffer: GPUBuffer,
    public lineHeight: number,
    public chars: { [x: number]: MsdfChar },
    public kernings: KerningMap,
    public size: number
  ) {
    const charArray = Object.values(chars);
    this.pageTextures = pageTextures;
    this.charCount = charArray.length;
    this.defaultChar = charArray[0];
  }

  getChar(charCode: number): MsdfChar {
    let char = this.chars[charCode];
    if (!char) {
      char = this.defaultChar;
    }
    return char;
  }

  // Gets the distance in pixels a line should advance for a given character code. If the upcoming
  // character code is given any kerning between the two characters will be taken into account.
  getXAdvance(charCode: number, nextCharCode: number = -1): number {
    const char = this.getChar(charCode);
    if (nextCharCode >= 0) {
      const kerning = this.kernings.get(charCode);
      if (kerning) {
        return char.xadvance + (kerning.get(nextCharCode) ?? 0);
      }
    }
    return char.xadvance;
  }

  dispose() {
    this.charsBuffer.destroy();
    this.pageTextures.forEach((texture) => {
      texture.destroy();
    });
  }
}

async function loadTexture(
  url: string,
  device: GPUDevice
): Promise<GPUTexture> {
  const response = await fetch(url);
  const imageBitmap = await createImageBitmap(await response.blob());

  const texture = device.createTexture({
    label: `MSDF font texture ${url}`,
    size: [imageBitmap.width, imageBitmap.height, 1],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture },
    [imageBitmap.width, imageBitmap.height]
  );
  return texture;
}

export async function createFont(
  fontJsonUrl: string,
  device: GPUDevice
): Promise<MsdfFont> {
  const response = await fetch(fontJsonUrl);
  const json = await response.json();

  const i = fontJsonUrl.lastIndexOf('/');
  const baseUrl = i !== -1 ? fontJsonUrl.substring(0, i + 1) : undefined;

  const pagePromises = [];
  for (const pageUrl of json.pages) {
    pagePromises.push(loadTexture(baseUrl + pageUrl, device));
  }

  const charCount = json.chars.length;
  const charsBuffer = device.createBuffer({
    label: 'MSDF character layout buffer',
    size: charCount * Float32Array.BYTES_PER_ELEMENT * 8,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });

  const charsArray = new Float32Array(charsBuffer.getMappedRange());

  const u = 1 / json.common.scaleW;
  const v = 1 / json.common.scaleH;

  const chars: { [x: number]: MsdfChar } = {};

  let offset = 0;
  for (const [i, char] of json.chars.entries()) {
    chars[char.id] = char;
    chars[char.id].charIndex = i;
    charsArray[offset] = char.x * u; // texOffset.x
    charsArray[offset + 1] = char.y * v; // texOffset.y
    charsArray[offset + 2] = char.width * u; // texExtent.x
    charsArray[offset + 3] = char.height * v; // texExtent.y
    charsArray[offset + 4] = char.width; // size.x
    charsArray[offset + 5] = char.height; // size.y
    charsArray[offset + 6] = char.xoffset; // offset.x
    charsArray[offset + 7] = -char.yoffset; // offset.y
    offset += 8;
  }

  charsBuffer.unmap();

  const pageTextures = await Promise.all(pagePromises);
  const kernings = new Map();

  if (json.kernings) {
    for (const kearning of json.kernings) {
      let charKerning = kernings.get(kearning.first);
      if (!charKerning) {
        charKerning = new Map<number, number>();
        kernings.set(kearning.first, charKerning);
      }
      charKerning.set(kearning.second, kearning.amount);
    }
  }

  return new MsdfFont(
    pageTextures,
    charsBuffer,
    json.common.lineHeight,
    chars,
    kernings,
    json.info.size
  );
}
