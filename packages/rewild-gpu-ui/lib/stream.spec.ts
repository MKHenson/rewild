import { fitRadii, PRIMITIVE_FLOATS, PrimitiveStream } from './stream';
import { UIStyle } from './style';
import { UINode } from './UINode';
import { UISurface } from './UISurface';

function primitive(stream: PrimitiveStream, index: number) {
  const o = index * PRIMITIVE_FLOATS;
  const d = Array.from(stream.data.subarray(o, o + PRIMITIVE_FLOATS));
  return {
    rect: d.slice(0, 4),
    clip: d.slice(4, 8),
    clipRadii: d.slice(8, 12),
    radii: d.slice(12, 16),
    fill: d.slice(16, 20),
    border: d.slice(20, 24),
    borderWidth: d[24],
    opacity: d[25],
    effect: d.slice(28, 32),
  };
}

function surfaceWith(...styles: UIStyle[]) {
  const surface = new UISurface({ kind: 'screen', name: 'test' });
  let parent = surface.root;
  for (const style of styles) {
    const node = new UINode({ style: { position: 'absolute', ...style } });
    parent.append(node);
    parent = node;
  }
  surface.update(200, 100);
  return surface;
}

describe('the primitive stream', () => {
  it('writes nothing for a box with no fill or border', () => {
    expect(surfaceWith({ width: 10, height: 10 }).stream.count).toBe(0);
  });

  it('writes a box with its rect, colours and border', () => {
    const { stream } = surfaceWith({
      left: 1,
      top: 2,
      width: 30,
      height: 40,
      backgroundColor: '#ff0000',
      borderColor: '#0000ff80',
      borderWidth: 3,
      borderRadius: [1, 2, 3, 4],
    });
    expect(stream.count).toBe(1);
    const p = primitive(stream, 0);
    expect(p.rect).toEqual([1, 2, 30, 40]);
    expect(p.fill).toEqual([1, 0, 0, 1]);
    expect(p.border[3]).toBeCloseTo(128 / 255);
    expect(p.borderWidth).toBe(3);
    expect(p.radii).toEqual([1, 2, 3, 4]);
    expect(p.opacity).toBe(1);
  });

  it('writes nodes in tree order', () => {
    const { stream } = surfaceWith(
      { width: 50, height: 50, backgroundColor: '#ff0000' },
      { width: 10, height: 10, backgroundColor: '#00ff00' }
    );
    expect(stream.count).toBe(2);
    expect(primitive(stream, 0).fill).toEqual([1, 0, 0, 1]);
    expect(primitive(stream, 1).fill).toEqual([0, 1, 0, 1]);
  });

  it('clips children to the inside of a hidden overflow border', () => {
    const { stream } = surfaceWith(
      {
        left: 10,
        top: 10,
        width: 50,
        height: 40,
        borderWidth: 2,
        borderRadius: 8,
        overflow: 'hidden',
      },
      { width: 100, height: 100, backgroundColor: '#ffffff' }
    );
    const child = primitive(stream, 0);
    expect(child.clip).toEqual([12, 12, 46, 36]);
    expect(child.clipRadii).toEqual([6, 6, 6, 6]);
  });

  it('intersects nested clips', () => {
    const { stream } = surfaceWith(
      { left: 0, top: 0, width: 50, height: 50, overflow: 'hidden' },
      { left: 30, top: 30, width: 50, height: 50, overflow: 'hidden' },
      { width: 10, height: 10, backgroundColor: '#ffffff' }
    );
    expect(primitive(stream, 0).clip).toEqual([30, 30, 20, 20]);
  });

  it('multiplies opacity down the tree', () => {
    const { stream } = surfaceWith(
      { width: 50, height: 50, opacity: 0.5 },
      { width: 10, height: 10, opacity: 0.5, backgroundColor: '#ffffff' }
    );
    expect(primitive(stream, 0).opacity).toBe(0.25);
  });

  it('skips a subtree with no opacity', () => {
    const { stream } = surfaceWith(
      { width: 50, height: 50, opacity: 0, backgroundColor: '#ffffff' },
      { width: 10, height: 10, backgroundColor: '#ffffff' }
    );
    expect(stream.count).toBe(0);
  });

  it('skips a subtree with display none', () => {
    const { stream } = surfaceWith(
      { width: 50, height: 50, display: 'none', backgroundColor: '#ffffff' },
      { width: 10, height: 10, backgroundColor: '#ffffff' }
    );
    expect(stream.count).toBe(0);
  });

  it('draws the layout overlay after the tree', () => {
    const surface = surfaceWith({
      left: 10,
      top: 10,
      width: 50,
      height: 40,
      margin: 5,
      padding: [4, 0, 0, 0],
      backgroundColor: '#ff0000',
    });
    surface.showLayout = true;
    expect(surface.update(200, 100)).toBe(true);
    const { stream } = surface;
    // The box, four margin strips, one padding strip and the outline.
    expect(stream.count).toBe(7);
    expect(primitive(stream, 0).fill).toEqual([1, 0, 0, 1]);
    expect(primitive(stream, 1).rect).toEqual([10, 10, 60, 5]);
    expect(primitive(stream, 5).rect).toEqual([15, 15, 50, 4]);
    expect(primitive(stream, 6).rect).toEqual([15, 15, 50, 40]);
    expect(primitive(stream, 6).borderWidth).toBe(1);
  });

  it('leaves nodes that draw nothing out of the overlay', () => {
    const surface = surfaceWith({ width: 50, height: 40, opacity: 0 });
    surface.showLayout = true;
    surface.update(200, 100);
    expect(surface.stream.count).toBe(0);
    surface.root.children[0].style.opacity = 1;
    surface.update(200, 100);
    expect(surface.stream.count).toBe(1);
    surface.root.style.display = 'none';
    surface.update(200, 100);
    expect(surface.stream.count).toBe(0);
  });

  it('grows past its first size', () => {
    const surface = new UISurface({ kind: 'screen', name: 'test' });
    for (let i = 0; i < 200; i++)
      surface.root.append(
        new UINode({ style: { height: 1, backgroundColor: '#ffffff' } })
      );
    surface.update(10, 10);
    expect(surface.stream.count).toBe(200);
  });
});

describe('effects in the stream', () => {
  function surfaceWithEffect() {
    const surface = new UISurface({ kind: 'screen', name: 'test' });
    const plain = new UINode({
      style: { width: 10, height: 10, backgroundColor: '#ffffff' },
    });
    const node = new UINode({
      effect: 'meter',
      style: { width: 10, height: 10 },
    });
    node.setEffectParams(0.5, 1, 2, 3);
    surface.root.append(plain, node);
    surface.update(100, 100);
    return { surface, node };
  }

  it('writes an effect node with no fill, with its effect and params', () => {
    const { surface } = surfaceWithEffect();
    const { stream } = surface;
    expect(stream.count).toBe(2);
    expect(stream.effects.slice(0, 2)).toEqual([null, 'meter']);
    expect(primitive(stream, 1).effect).toEqual([0.5, 1, 2, 3]);
  });

  it('changes params in place, with no rebuild', () => {
    const { surface, node } = surfaceWithEffect();
    const { stream } = surface;
    stream.clearDirty();
    node.setEffectParams(0.25, 1, 2, 3);
    expect(primitive(stream, 1).effect).toEqual([0.25, 1, 2, 3]);
    expect([stream.dirtyFrom, stream.dirtyTo]).toEqual([1, 2]);
    expect(surface.needsPaint).toBe(false);
    expect(surface.update(100, 100)).toBe(false);
  });

  it('keeps the params of a hidden node for when it shows', () => {
    const { surface, node } = surfaceWithEffect();
    node.style.display = 'none';
    surface.update(100, 100);
    node.setEffectParams(0.75, 1, 2, 3);
    expect(surface.stream.count).toBe(1);
    node.style.display = 'flex';
    surface.update(100, 100);
    expect(primitive(surface.stream, 1).effect).toEqual([0.75, 1, 2, 3]);
  });

  it('marks the whole stream for upload after a rebuild', () => {
    const { surface } = surfaceWithEffect();
    expect([surface.stream.dirtyFrom, surface.stream.dirtyTo]).toEqual([0, 2]);
  });
});

describe('fitRadii', () => {
  const rect = { x: 0, y: 0, width: 100, height: 20 };

  it('keeps radii that fit', () => {
    expect(fitRadii([10, 10, 10, 10], rect)).toEqual([10, 10, 10, 10]);
  });

  it('scales radii down to a pill', () => {
    expect(fitRadii([999, 999, 999, 999], rect)).toEqual([10, 10, 10, 10]);
  });
});

describe('UISurface.update', () => {
  it('does nothing when nothing changed', () => {
    const surface = surfaceWith({
      width: 10,
      height: 10,
      backgroundColor: '#fff',
    });
    expect(surface.update(200, 100)).toBe(false);
  });

  it('lays out again when the size changes', () => {
    const surface = surfaceWith({ right: 0, width: 10, height: 10 });
    expect(surface.update(300, 100)).toBe(true);
    expect(surface.root.children[0].rect.x).toBe(290);
  });
});
