import { Renderer } from '../Renderer';
import { createFont, MsdfFont } from '../fonts/MsdfFont';

export type FontType = 'basic-font';

export class FontManager {
  fonts: Map<string, MsdfFont>;
  initialized: boolean;

  constructor() {
    this.fonts = new Map();
    this.initialized = false;
  }

  get(id: string) {
    const toRet = this.fonts.get(id);
    if (!toRet) throw new Error(`Could not find font with id ${id}`);
    return toRet;
  }

  async initialize(renderer: Renderer) {
    if (this.initialized) return;

    this.addFont(
      'basic-font',
      await createFont(`/fonts/ya-hei-ascii-msdf.json`, renderer.device)
    );
    this.initialized = true;
  }

  dispose() {
    Array.from(this.fonts.values()).forEach((font) => {
      font.dispose();
    });

    this.fonts.clear();
    this.initialized = false;
  }

  addFont(id: FontType, font: MsdfFont) {
    this.fonts.set(id, font);
    return font;
  }
}
