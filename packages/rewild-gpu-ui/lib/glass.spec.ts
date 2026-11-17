import { blurSteps, glassSurface } from './glassStyle';
import { hitTest } from './hitTest';
import {
  PRIMITIVE_FLOATS,
  PrimitiveKind,
  PrimitiveStream,
  spreadRadius,
} from './stream';
import { UIStyle } from './style';
import { UITheme } from './theme';
import { UINode } from './UINode';
import { UISurface } from './UISurface';

function primitive(stream: PrimitiveStream, index: number) {
  const o = index * PRIMITIVE_FLOATS;
  const d = Array.from(stream.data.subarray(o, o + PRIMITIVE_FLOATS));
  return {
    rect: d.slice(0, 4),
    radii: d.slice(12, 16),
    fill: d.slice(16, 20),
    border: d.slice(20, 24),
    borderWidth: d[24],
    kind: d[26],
    outset: d[27],
    effect: d.slice(28, 32),
  };
}

function surfaceWith(style: UIStyle, theme: UITheme | null = null) {
  const surface = new UISurface({ kind: 'screen', name: 'test' });
  surface.theme = theme;
  const node = new UINode({ style: { position: 'absolute', ...style } });
  surface.root.append(node);
  surface.update(200, 100);
  return { surface, node };
}

describe('glass', () => {
  const theme = new UITheme();
  theme.set({ surface: [0.2, 0.2, 0.2, 1] });

  it('writes a glass box with the surface colour over it', () => {
    const { surface } = surfaceWith(
      { width: 50, height: 40, ...glassSurface() },
      theme
    );
    const p = primitive(surface.stream, 0);
    expect(p.kind).toBe(PrimitiveKind.Glass);
    expect(p.fill[3]).toBeCloseTo(0.6);
    expect(surface.stream.glass).toBe(1);
  });

  it('writes a glass box with no background, so the blur shows alone', () => {
    const { surface } = surfaceWith({
      width: 50,
      height: 40,
      backdrop: 'glass',
    });
    expect(surface.stream.count).toBe(1);
    expect(surface.stream.glass).toBe(1);
  });

  it('counts no glass when none shows', () => {
    const { surface, node } = surfaceWith({
      width: 50,
      height: 40,
      backdrop: 'glass',
    });
    node.style.display = 'none';
    surface.update(200, 100);
    expect(surface.stream.glass).toBe(0);
  });
});

describe('box shadows', () => {
  it('writes outer shadows under the box and inset shadows over it, the first on top', () => {
    const { surface } = surfaceWith({
      width: 50,
      height: 40,
      backgroundColor: '#ffffff',
      boxShadow: [
        { y: 4, blur: 8, color: '#ff0000' },
        { y: 2, color: '#00ff00' },
        { inset: true, y: 1, color: '#0000ff' },
      ],
    });
    const kinds = [0, 1, 2, 3].map((i) => primitive(surface.stream, i).kind);
    expect(kinds).toEqual([
      PrimitiveKind.Shadow,
      PrimitiveKind.Shadow,
      PrimitiveKind.Rect,
      PrimitiveKind.InsetShadow,
    ]);
    // The second shadow draws first, under the first.
    expect(primitive(surface.stream, 0).fill).toEqual([0, 1, 0, 1]);
    expect(primitive(surface.stream, 1).fill).toEqual([1, 0, 0, 1]);
  });

  it('gives a shadow its offset, deviation, spread and a quad that covers it', () => {
    const { surface } = surfaceWith({
      width: 50,
      height: 40,
      boxShadow: { x: 3, y: -6, blur: 10, spread: 2, color: '#000000' },
    });
    const p = primitive(surface.stream, 0);
    expect(p.effect).toEqual([3, -6, 5, 2]);
    expect(p.outset).toBe(6 + 2 + 15);
  });

  it('grows the corners with the spread, and keeps a square corner square', () => {
    expect(spreadRadius(0, 10)).toBe(0);
    expect(spreadRadius(20, 10)).toBe(30);
    expect(spreadRadius(5, 10)).toBeCloseTo(5 + 10 * (1 - 0.125));
    expect(spreadRadius(5, -10)).toBe(0);
  });

  it('writes no shadow in a transparent colour', () => {
    const { surface } = surfaceWith({
      width: 50,
      height: 40,
      boxShadow: { blur: 4, color: '#00000000' },
    });
    expect(surface.stream.count).toBe(0);
  });
});

describe('transforms', () => {
  it('scales a box and its children about its centre, then moves it', () => {
    const surface = new UISurface({ kind: 'screen', name: 'test' });
    const parent = new UINode({
      style: {
        position: 'absolute',
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        backgroundColor: '#ffffff',
        borderRadius: 10,
        transform: { x: 5, scale: 0.5 },
      },
    });
    const child = new UINode({
      style: {
        position: 'absolute',
        left: 0,
        top: 0,
        width: 20,
        height: 20,
        backgroundColor: '#ff0000',
      },
    });
    parent.append(child);
    surface.root.append(parent);
    surface.update(200, 200);
    expect(primitive(surface.stream, 0).rect).toEqual([30, 25, 50, 50]);
    expect(primitive(surface.stream, 0).radii).toEqual([5, 5, 5, 5]);
    expect(primitive(surface.stream, 1).rect).toEqual([30, 25, 10, 10]);
  });

  it('hits the box where it draws', () => {
    const surface = new UISurface({ kind: 'screen', name: 'test' });
    const node = new UINode({
      style: {
        position: 'absolute',
        left: 0,
        top: 0,
        width: 40,
        height: 40,
        transform: { x: 100 },
      },
    });
    surface.root.append(node);
    surface.update(200, 100);
    expect(hitTest(surface.root, 10, 10)).toBe(surface.root);
    expect(hitTest(surface.root, 110, 10)).toBe(node);
  });
});

describe('the theme on a surface', () => {
  it('draws again with the new colours when the theme changes', () => {
    const theme = new UITheme();
    theme.set({ primary400: [1, 0, 0, 1] });
    const { surface } = surfaceWith(
      { width: 10, height: 10, backgroundColor: 'primary400' },
      theme
    );
    expect(primitive(surface.stream, 0).fill).toEqual([1, 0, 0, 1]);
    theme.set({ primary400: [0, 0, 1, 1] });
    expect(surface.update(200, 100)).toBe(true);
    expect(primitive(surface.stream, 0).fill).toEqual([0, 0, 1, 1]);
  });
});

describe('blurSteps', () => {
  it('keeps the tap offset where the taps leave no gaps', () => {
    for (const ratio of [1, 1.5, 2, 3]) {
      const { offset } = blurSteps(18 * ratio);
      expect(offset).toBeGreaterThanOrEqual(0.5);
      expect(offset).toBeLessThanOrEqual(1.5);
    }
  });

  it('adds a level as the blur grows', () => {
    expect(blurSteps(18).levels).toBe(2);
    expect(blurSteps(36).levels).toBe(3);
  });
});
