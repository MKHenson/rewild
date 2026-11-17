import { FontAtlasData, FontGlyph, UIFont } from './font';
import { PRIMITIVE_FLOATS, PrimitiveKind, PrimitiveStream } from './stream';
import { UIStyle } from './style';
import { layoutText } from './text';
import { UINode } from './UINode';
import { UISurface } from './UISurface';

/**
 * A font with round numbers. At 20 px a letter is 10 px wide, a space 5 px
 * and "…" 20 px. A line is 25 px high, with the baseline 20 px down. "k"
 * then "v" kerns by -2 px.
 */
function testData(): FontAtlasData {
  const glyph = (char: string, advance: number, cell: number): FontGlyph => ({
    unicode: char.codePointAt(0)!,
    advance,
    planeBounds: { left: 0, top: -1, right: advance, bottom: 0.25 },
    atlasBounds: { left: cell * 10, top: 0, right: cell * 10 + 10, bottom: 10 },
  });
  const glyphs = [
    { unicode: 0x20, advance: 0.25 },
    glyph('?', 0.5, 0),
    glyph('…', 1, 1),
    ...[...'abcdefghijklmnopqrstuvwxyz'].map((c, i) => glyph(c, 0.5, i + 2)),
  ];
  const variant = (name: string) => ({
    name,
    metrics: { lineHeight: 1.25, ascender: -1, descender: 0.25 },
    glyphs,
    kerning: [{ unicode1: 0x6b, unicode2: 0x76, advance: -0.1 }],
  });
  return {
    atlas: {
      type: 'mtsdf',
      distanceRange: 8,
      size: 10,
      width: 300,
      height: 10,
      yOrigin: 'top',
    },
    variants: [variant('regular'), variant('bold')],
  };
}

const font = new UIFont(testData());

function lay(text: string, limit = Infinity, whiteSpace: UIStyle['whiteSpace'] = 'normal') {
  return layoutText(font.regular, text, 20, 'normal', whiteSpace, limit);
}

function lineTexts(text: string, limit: number, whiteSpace?: UIStyle['whiteSpace']) {
  const layout = lay(text, limit, whiteSpace);
  return layout.lines.map((l) =>
    String.fromCodePoint(...layout.chars.slice(l.start, l.end))
  );
}

describe('text layout', () => {
  it('measures one line', () => {
    const layout = lay('ab cd');
    expect(layout.width).toBe(45);
    expect(layout.height).toBe(25);
  });

  it('wraps at spaces, and a trailing space takes no width', () => {
    const layout = lay('ab cd', 30);
    expect(lineTexts('ab cd', 30)).toEqual(['ab', 'cd']);
    expect(layout.width).toBe(20);
    expect(layout.height).toBe(50);
  });

  it('keeps as many words on a line as fit', () => {
    expect(lineTexts('ab cd ef gh', 45)).toEqual(['ab cd', 'ef gh']);
  });

  it('gives a word wider than the limit a line of its own', () => {
    expect(lineTexts('ab cdefgh ij', 30)).toEqual(['ab', 'cdefgh', 'ij']);
    expect(lay('ab cdefgh ij', 30).width).toBe(60);
  });

  it('joins runs of white space and drops it at the ends', () => {
    expect(lineTexts('  ab \n\t cd  ', Infinity)).toEqual(['ab cd']);
  });

  it('does not wrap with nowrap', () => {
    expect(lineTexts('ab cd ef', 10, 'nowrap')).toEqual(['ab cd ef']);
  });

  it('keeps line breaks with pre-line', () => {
    expect(lineTexts('ab\ncd', Infinity, 'pre-line')).toEqual(['ab', 'cd']);
    expect(lineTexts('ab\n\ncd\n', Infinity, 'pre-line')).toEqual([
      'ab',
      '',
      'cd',
    ]);
    expect(lineTexts('ab  cd ef\ngh', 30, 'pre-line')).toEqual([
      'ab',
      'cd',
      'ef',
      'gh',
    ]);
  });

  it('kerns pairs', () => {
    expect(lay('kv').width).toBe(18);
    expect(lay('vk').width).toBe(20);
  });

  it('gives empty text no size', () => {
    const layout = lay(' \n ');
    expect(layout.lines).toEqual([]);
    expect(layout.width).toBe(0);
    expect(layout.height).toBe(0);
  });

  it('sets the line height from a multiple of the font size', () => {
    const layout = layoutText(font.regular, 'ab cd', 20, 2, 'normal', 30);
    expect(layout.height).toBe(80);
  });

  it('uses the fallback for a character the font does not have', () => {
    expect(lay('aé').width).toBe(20);
    expect(font.regular.glyph(0xe9)).toBe(font.regular.glyph(0x3f));
  });
});

function textSurface(...nodes: UINode[]) {
  const surface = new UISurface({ kind: 'screen', name: 'test' });
  surface.font = font;
  surface.root.append(...nodes);
  surface.update(200, 100);
  return surface;
}

function glyphs(stream: PrimitiveStream) {
  const list = [];
  for (let i = 0; i < stream.count; i++) {
    const d = stream.data.subarray(i * PRIMITIVE_FLOATS, (i + 1) * PRIMITIVE_FLOATS);
    if (d[26] !== PrimitiveKind.Glyph) continue;
    list.push({
      rect: Array.from(d.subarray(0, 4)),
      clip: Array.from(d.subarray(4, 8)),
      color: Array.from(d.subarray(16, 20)),
      opacity: d[25],
      distanceRange: d[27],
      atlas: Array.from(d.subarray(28, 32)),
    });
  }
  return list;
}

describe('a node with text', () => {
  it('sizes its node', () => {
    const node = new UINode({
      text: 'ab cd',
      style: { position: 'absolute', fontSize: 20, padding: 5 },
    });
    textSurface(node);
    expect(node.rect).toEqual({ x: 0, y: 0, width: 55, height: 35 });
  });

  it('wraps to the width of its column and grows down', () => {
    const node = new UINode({ text: 'ab cd ef', style: { fontSize: 20 } });
    const column = new UINode({
      style: { position: 'absolute', width: 30, flexDirection: 'column' },
    });
    column.append(node);
    textSurface(column);
    expect(node.rect).toEqual({ x: 0, y: 0, width: 30, height: 75 });
  });

  it('takes its text style from its parents', () => {
    const node = new UINode({ text: 'ab', style: { position: 'absolute' } });
    const parent = new UINode({ style: { fontSize: 20 } });
    parent.append(node);
    const surface = textSurface(parent);
    expect(node.rect.width).toBe(20);
    parent.style.fontSize = 40;
    surface.update(200, 100);
    expect(node.rect.width).toBe(40);
  });

  it('has no size until there is a font, then lays out again', () => {
    const node = new UINode({
      text: 'ab',
      style: { position: 'absolute', fontSize: 20 },
    });
    const surface = new UISurface({ kind: 'screen', name: 'test' });
    surface.root.append(node);
    surface.update(200, 100);
    expect(node.rect.width).toBe(0);
    expect(surface.stream.count).toBe(0);
    surface.font = font;
    expect(surface.update(200, 100)).toBe(true);
    expect(node.rect.width).toBe(20);
    expect(glyphs(surface.stream)).toHaveLength(2);
  });

  it('lays out again when its text changes', () => {
    const node = new UINode({
      text: 'ab',
      style: { position: 'absolute', fontSize: 20 },
    });
    const surface = textSurface(node);
    node.text = 'abcd';
    expect(surface.needsLayout).toBe(true);
    surface.update(200, 100);
    expect(node.rect.width).toBe(40);
    node.text = null;
    surface.update(200, 100);
    expect(node.rect.width).toBe(0);
  });
});

describe('drawing text', () => {
  it('writes a glyph per character with a shape, after the box', () => {
    const node = new UINode({
      text: 'ab c',
      style: {
        position: 'absolute',
        left: 10,
        top: 4,
        fontSize: 20,
        backgroundColor: '#000000',
        color: '#ff0000',
      },
    });
    const { stream } = textSurface(node);
    expect(stream.count).toBe(4);
    const list = glyphs(stream);
    expect(list.map((g) => g.rect)).toEqual([
      [10, 4, 10, 25],
      [20, 4, 10, 25],
      [35, 4, 10, 25],
    ]);
    expect(list[0].color).toEqual([1, 0, 0, 1]);
    expect(list[0].distanceRange).toBe(8);
    expect(list[1].atlas).toEqual([30, 0, 40, 10]);
    expect(stream.effects.slice(0, 4)).toEqual([null, null, null, null]);
  });

  it('places lines in the content box, inside the border and padding', () => {
    const node = new UINode({
      text: 'ab cd',
      style: {
        position: 'absolute',
        width: 42,
        fontSize: 20,
        borderWidth: 1,
        padding: [2, 3, 4, 5],
      },
    });
    const list = glyphs(textSurface(node).stream);
    expect(list.map((g) => [g.rect[0], g.rect[1]])).toEqual([
      [6, 3],
      [16, 3],
      [6, 28],
      [16, 28],
    ]);
  });

  it('aligns each line in the content box', () => {
    const line = (textAlign: UIStyle['textAlign']) => {
      const node = new UINode({
        text: 'ab',
        style: { position: 'absolute', width: 50, fontSize: 20, textAlign },
      });
      return glyphs(textSurface(node).stream)[0].rect[0];
    };
    expect(line('left')).toBe(0);
    expect(line('center')).toBe(15);
    expect(line('right')).toBe(30);
  });

  it('aligns a line too long for its box to the left', () => {
    const node = new UINode({
      text: 'abcdef',
      style: { position: 'absolute', width: 30, fontSize: 20, textAlign: 'right' },
    });
    expect(glyphs(textSurface(node).stream)[0].rect[0]).toBe(0);
  });

  it('snaps baselines to device pixels', () => {
    const node = new UINode({
      text: 'a',
      style: { position: 'absolute', top: 0.3, fontSize: 20 },
    });
    const surface = textSurface(node);
    surface.update(200, 100, 2);
    // The baseline is at 20.3, which snaps to 20.5 at 2x.
    expect(glyphs(surface.stream)[0].rect[1]).toBe(0.5);
  });

  it('clips text to the box when overflow is hidden', () => {
    const node = new UINode({
      text: 'abcdef',
      style: {
        position: 'absolute',
        left: 10,
        width: 30,
        fontSize: 20,
        overflow: 'hidden',
      },
    });
    const list = glyphs(textSurface(node).stream);
    expect(list).toHaveLength(6);
    expect(list[0].clip).toEqual([10, 0, 30, 25]);
  });

  it('ends a line too long for its box with an ellipsis', () => {
    const node = new UINode({
      text: 'ab cdef',
      style: {
        position: 'absolute',
        width: 45,
        fontSize: 20,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
    });
    const list = glyphs(textSurface(node).stream);
    // "a" and "b" fit with the 20 px ellipsis. The space before it goes.
    expect(list.map((g) => g.atlas[0])).toEqual([20, 30, 10]);
    expect(list[2].rect[0]).toBe(20);
  });

  it('needs overflow hidden for an ellipsis, as in CSS', () => {
    const node = new UINode({
      text: 'abcdef',
      style: {
        position: 'absolute',
        width: 30,
        fontSize: 20,
        textOverflow: 'ellipsis',
      },
    });
    expect(glyphs(textSurface(node).stream)).toHaveLength(6);
  });

  it('fades text with the opacity of its parents', () => {
    const node = new UINode({ text: 'a', style: { position: 'absolute' } });
    const parent = new UINode({ style: { opacity: 0.5 } });
    parent.append(node);
    expect(glyphs(textSurface(parent).stream)[0].opacity).toBe(0.5);
  });

  it('draws in bold with the bold face', () => {
    expect(font.face('bold')).toBe(font.bold);
    expect(font.face('normal')).toBe(font.regular);
  });
});
