import atlas from '../fonts/roboto-msdf.json';
import { FontAtlasData, FontGlyph, UIFont } from './font';

const data = atlas as FontAtlasData;

describe('the Roboto atlas', () => {
  const font = new UIFont(data);

  it('is an MTSDF atlas with y down', () => {
    expect(data.atlas.type).toBe('mtsdf');
    expect(data.atlas.yOrigin).toBe('top');
    expect(font.regular.metrics.ascender).toBeLessThan(0);
  });

  it('has a regular and a bold face', () => {
    expect(font.regular.name).toBe('regular');
    expect(font.bold.name).toBe('bold');
  });

  it('has Latin-1 and the ellipsis in both faces', () => {
    const codes = [0x20, 0x41, 0x7a, 0xe9, 0xff, 0x2026];
    for (const face of [font.regular, font.bold])
      for (const code of codes) expect(face.has(code)).toBe(true);
  });

  it('has every glyph cell inside the atlas', () => {
    const { width, height } = data.atlas;
    for (const variant of data.variants)
      for (const { atlasBounds: a } of variant.glyphs) {
        if (!a) continue;
        expect(a.left).toBeGreaterThanOrEqual(0);
        expect(a.top).toBeGreaterThanOrEqual(0);
        expect(a.right).toBeLessThanOrEqual(width);
        expect(a.bottom).toBeLessThanOrEqual(height);
      }
  });

  it('kerns "AV" closer', () => {
    expect(font.regular.kern(0x41, 0x56)).toBeLessThan(0);
  });

  it('has the line height a browser uses for Roboto', () => {
    expect(font.regular.metrics.lineHeight).toBeCloseTo(1.171875);
  });

  it('draws bold strokes wider than regular', () => {
    const width = (glyph: FontGlyph) =>
      glyph.planeBounds!.right - glyph.planeBounds!.left;
    const l = 0x6c;
    expect(width(font.bold.glyph(l))).toBeGreaterThan(
      width(font.regular.glyph(l))
    );
  });
});
