import atlas from '../icons/lucide-icons.json';
import { Icon } from './components/Icon';
import { UI_ICON_NAMES } from './iconNames';
import { IconAtlasData, UIIcons } from './icons';
import { PRIMITIVE_FLOATS, PrimitiveKind, PrimitiveStream } from './stream';
import { UINode } from './UINode';
import { UISurface } from './UISurface';

const data = atlas as IconAtlasData;

describe('the lucide icon atlas', () => {
  it('is an SDF atlas with y down', () => {
    expect(data.atlas.type).toBe('sdf');
    expect(data.atlas.yOrigin).toBe('top');
  });

  it('has each icon in the name list, in order', () => {
    expect(data.icons.map((i) => i.name)).toEqual([...UI_ICON_NAMES]);
  });

  it('has every icon cell inside the atlas', () => {
    const { width, height } = data.atlas;
    for (const { atlasBounds: a } of data.icons) {
      expect(a.left).toBeGreaterThanOrEqual(0);
      expect(a.top).toBeGreaterThanOrEqual(0);
      expect(a.right).toBeLessThanOrEqual(width);
      expect(a.bottom).toBeLessThanOrEqual(height);
    }
  });

  it('places each icon on its square, with room for the distance range', () => {
    // A stroke reaches at most a half stroke past the 24-unit grid, and the
    // quad adds the distance range.
    const margin = 1 / 24 + data.atlas.distanceRange / data.atlas.size;
    for (const { planeBounds: p } of data.icons) {
      expect(p.left).toBeGreaterThanOrEqual(-margin);
      expect(p.top).toBeGreaterThanOrEqual(-margin);
      expect(p.right).toBeLessThanOrEqual(1 + margin);
      expect(p.bottom).toBeLessThanOrEqual(1 + margin);
    }
  });

  it('centres the x icon on its square', () => {
    const x = new UIIcons(data).icon('x')!.planeBounds;
    expect(x.left + x.right).toBeCloseTo(1, 2);
    expect(x.top + x.bottom).toBeCloseTo(1, 2);
  });
});

/**
 * Icons with round numbers. The "x" quad is its whole square, and the
 * "play" quad is the middle half of it.
 */
const icons = new UIIcons({
  atlas: {
    type: 'sdf',
    distanceRange: 4,
    size: 10,
    width: 20,
    height: 10,
    yOrigin: 'top',
  },
  icons: [
    {
      name: 'x',
      planeBounds: { left: 0, top: 0, right: 1, bottom: 1 },
      atlasBounds: { left: 0.5, top: 0.5, right: 9.5, bottom: 9.5 },
    },
    {
      name: 'play',
      planeBounds: { left: 0.25, top: 0.25, right: 0.75, bottom: 0.75 },
      atlasBounds: { left: 10.5, top: 0.5, right: 19.5, bottom: 9.5 },
    },
  ],
});

function iconSurface(pixelRatio: number, ...nodes: UINode[]) {
  const surface = new UISurface({ kind: 'screen', name: 'test' });
  surface.icons = icons;
  surface.root.append(...nodes);
  surface.update(200, 100, pixelRatio);
  return surface;
}

function primitives(stream: PrimitiveStream) {
  const list = [];
  for (let i = 0; i < stream.count; i++) {
    const d = stream.data.subarray(i * PRIMITIVE_FLOATS, (i + 1) * PRIMITIVE_FLOATS);
    list.push({
      kind: d[26],
      rect: Array.from(d.subarray(0, 4)),
      color: Array.from(d.subarray(16, 20)),
      opacity: d[25],
      distanceRange: d[27],
      atlas: Array.from(d.subarray(28, 32)),
    });
  }
  return list;
}

function absolute(icon: Icon): UINode {
  icon.node.style.position = 'absolute';
  return icon.node;
}

describe('an icon node', () => {
  it('draws its icon on its box, in white by default', () => {
    const { stream } = iconSurface(1, absolute(new Icon({ icon: 'x', size: 20 })));
    expect(primitives(stream)).toEqual([
      {
        kind: PrimitiveKind.Icon,
        rect: [0, 0, 20, 20],
        color: [1, 1, 1, 1],
        opacity: 1,
        distanceRange: 4,
        atlas: [0.5, 0.5, 9.5, 9.5],
      },
    ]);
  });

  it('maps its plane bounds onto its square', () => {
    const node = absolute(new Icon({ icon: 'play', size: 40 }));
    node.style.left = 10;
    const [p] = primitives(iconSurface(1, node).stream);
    expect(p.rect).toEqual([20, 10, 20, 20]);
  });

  it('takes its colour from its parents, or its own', () => {
    const inherits = absolute(new Icon({ icon: 'x' }));
    const own = absolute(new Icon({ icon: 'x', color: '#00ff00' }));
    const parent = new UINode({ style: { color: '#ff0000' } });
    parent.append(inherits, own);
    const [a, b] = primitives(iconSurface(1, parent).stream);
    expect(a.color).toEqual([1, 0, 0, 1]);
    expect(b.color).toEqual([0, 1, 0, 1]);
  });

  it('centres the largest square that fits its content box', () => {
    const node = new UINode({
      icon: 'x',
      style: { position: 'absolute', width: 60, height: 30, padding: 5 },
    });
    const [p] = primitives(iconSurface(1, node).stream);
    expect(p.rect).toEqual([20, 5, 20, 20]);
  });

  it('snaps its square to device pixels', () => {
    const node = new UINode({
      icon: 'x',
      style: { position: 'absolute', left: 10.3, top: 0.6, width: 20, height: 20 },
    });
    expect(primitives(iconSurface(1, node).stream)[0].rect).toEqual([10, 1, 20, 20]);
    expect(primitives(iconSurface(2, node).stream)[0].rect).toEqual([10.5, 0.5, 20, 20]);
  });

  it('draws after its box and before its text and children', () => {
    const node = new UINode({
      icon: 'x',
      style: { position: 'absolute', width: 20, height: 20, backgroundColor: '#000000' },
    });
    const child = new UINode({
      style: { width: 5, height: 5, backgroundColor: '#ffffff' },
    });
    node.append(child);
    const kinds = primitives(iconSurface(1, node).stream).map((p) => p.kind);
    expect(kinds).toEqual([PrimitiveKind.Rect, PrimitiveKind.Icon, PrimitiveKind.Rect]);
  });

  it('fades with its opacity', () => {
    const icon = new Icon({ icon: 'x', style: { position: 'absolute', opacity: 0.5 } });
    expect(primitives(iconSurface(1, icon.node).stream)[0].opacity).toBe(0.5);
  });

  it('draws nothing with no icons, or an icon the atlas does not have', () => {
    const surface = new UISurface({ kind: 'screen', name: 'test' });
    surface.root.append(absolute(new Icon({ icon: 'x' })));
    surface.update(200, 100);
    expect(surface.stream.count).toBe(0);
    expect(iconSurface(1, absolute(new Icon({ icon: 'settings' }))).stream.count).toBe(0);
  });

  it('marks only paint dirty when its icon changes', () => {
    const icon = new Icon({ icon: 'x' });
    const surface = iconSurface(1, absolute(icon));
    icon.icon = 'play';
    expect(surface.needsLayout).toBe(false);
    expect(surface.needsPaint).toBe(true);
  });

  it('lays out again when its size changes', () => {
    const icon = new Icon({ icon: 'x' });
    const surface = iconSurface(1, absolute(icon));
    expect(icon.node.rect.width).toBe(24);
    icon.size = 32;
    surface.update(200, 100);
    expect(icon.node.rect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
  });
});
