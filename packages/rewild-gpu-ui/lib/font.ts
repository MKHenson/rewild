import type { FontWeight } from './style';

/** Ems for `left`, `top`, `right` and `bottom`, or texels in the atlas. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface FontGlyph {
  unicode: number;
  /** In ems. */
  advance: number;
  /**
   * The quad in ems from the pen on the baseline, with y down. A glyph with
   * no shape, such as a space, has none.
   */
  planeBounds?: Bounds;
  /**
   * The quad's cell in texels from the atlas's top left. The edges are on
   * texel centres.
   */
  atlasBounds?: Bounds;
}

/** In ems, with y down from the baseline, as the atlas JSON has them. */
export interface FontMetrics {
  /** `line-height: normal`. */
  lineHeight: number;
  /** The top of the font's line box. Negative, because it is above the baseline. */
  ascender: number;
  /** The bottom of the font's line box. Positive. */
  descender: number;
}

export interface FontVariantData {
  name: string;
  metrics: FontMetrics;
  glyphs: FontGlyph[];
  kerning: { unicode1: number; unicode2: number; advance: number }[];
}

/**
 * An MTSDF atlas and its glyphs: msdf-atlas-gen's JSON with `yOrigin: 'top'`,
 * as `scripts/build-font-atlas.mjs` writes it. The colour channels hold the
 * multi-channel distance for sharp corners. Alpha holds the true distance,
 * for effects such as outlines.
 */
export interface FontAtlasData {
  atlas: {
    type: string;
    /** The width of the distance field across an edge, in texels. */
    distanceRange: number;
    /** Texels per em. */
    size: number;
    width: number;
    height: number;
    yOrigin: 'top';
  };
  variants: FontVariantData[];
}

/** One face of a font, such as its bold. Sizes are in ems. */
export class UIFontFace {
  readonly name: string;
  readonly metrics: FontMetrics;
  /** Drawn for a character the face does not have. */
  readonly fallback: FontGlyph;
  private glyphs = new Map<number, FontGlyph>();
  private kerning = new Map<number, number>();

  constructor(data: FontVariantData) {
    this.name = data.name;
    this.metrics = data.metrics;
    for (const glyph of data.glyphs) this.glyphs.set(glyph.unicode, glyph);
    for (const k of data.kerning)
      this.kerning.set(pairKey(k.unicode1, k.unicode2), k.advance);
    const fallback = this.glyphs.get(0x3f) ?? data.glyphs[0];
    if (!fallback) throw new Error(`The font face "${data.name}" has no glyphs`);
    this.fallback = fallback;
  }

  has(unicode: number): boolean {
    return this.glyphs.has(unicode);
  }

  glyph(unicode: number): FontGlyph {
    return this.glyphs.get(unicode) ?? this.fallback;
  }

  /** The change to the advance between two characters. */
  kern(left: number, right: number): number {
    return this.kerning.get(pairKey(left, right)) ?? 0;
  }
}

function pairKey(left: number, right: number): number {
  // Code points fit in 21 bits, so the key stays below 2^53.
  return left * 0x200000 + right;
}

/**
 * The UI font: a regular and a bold face in one MTSDF atlas. Layout and
 * measuring need only the data. Drawing needs `texture`.
 */
export class UIFont {
  readonly regular: UIFontFace;
  readonly bold: UIFontFace;
  readonly distanceRange: number;
  /** The atlas, or null for a font made only for measuring. */
  texture: GPUTexture | null = null;

  constructor(data: FontAtlasData) {
    const variant = (name: string) => {
      const found = data.variants.find((v) => v.name === name);
      if (!found) throw new Error(`The font atlas has no "${name}" face`);
      return new UIFontFace(found);
    };
    this.regular = variant('regular');
    this.bold = variant('bold');
    this.distanceRange = data.atlas.distanceRange;
  }

  face(weight: FontWeight | undefined): UIFontFace {
    return weight === 'bold' ? this.bold : this.regular;
  }

  /**
   * Loads the atlas JSON from `url` and its PNG from the same folder, with
   * the same name.
   */
  static async load(device: GPUDevice, url: string): Promise<UIFont> {
    const data = (await (await fetch(url)).json()) as FontAtlasData;
    const font = new UIFont(data);
    const image = url.replace(/\.json$/, '.png');
    // The channels are distances, not colours, so the image loads with no
    // colour conversion.
    const bitmap = await createImageBitmap(await (await fetch(image)).blob(), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    const texture = device.createTexture({
      label: `ui-font ${image}`,
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
    font.texture = texture;
    return font;
  }

  dispose(): void {
    this.texture?.destroy();
    this.texture = null;
  }
}
