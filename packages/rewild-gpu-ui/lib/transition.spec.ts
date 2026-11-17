import { mixColors } from './color';
import { UIStyle } from './style';
import { ease, findTransition } from './transition';
import { UINode } from './UINode';
import { UISurface } from './UISurface';

function surfaceWith(style: UIStyle) {
  const surface = new UISurface({ kind: 'screen', name: 'test' });
  const node = new UINode({
    style: { position: 'absolute', width: 10, height: 10, ...style },
  });
  surface.root.append(node);
  return { surface, node };
}

function fill(surface: UISurface): number[] {
  return Array.from(surface.stream.data.subarray(16, 20));
}

function opacity(surface: UISurface): number {
  return surface.stream.data[25];
}

describe('ease', () => {
  it('starts at 0 and ends at 1', () => {
    for (const easing of ['linear', 'ease', 'ease-in', 'ease-out'] as const) {
      expect(ease(easing, 0)).toBe(0);
      expect(ease(easing, 1)).toBe(1);
    }
  });

  it('follows the CSS curves', () => {
    expect(ease('linear', 0.25)).toBe(0.25);
    expect(ease('ease-in-out', 0.5)).toBeCloseTo(0.5, 4);
    // ease is ahead of linear at the middle.
    expect(ease('ease', 0.5)).toBeCloseTo(0.8024, 3);
  });
});

describe('findTransition', () => {
  it('finds the last entry for the property or for all', () => {
    const style: UIStyle = {
      transition: [
        { property: 'opacity', duration: 100 },
        { property: 'all', duration: 200 },
      ],
    };
    expect(findTransition(style, 'opacity')?.duration).toBe(200);
    expect(findTransition({}, 'opacity')).toBeNull();
  });
});

describe('mixColors', () => {
  it('mixes with premultiplied alpha, so a fade to transparent keeps its colour', () => {
    const mixed = mixColors([1, 0, 0, 1], [0, 0, 0, 0], 0.5);
    expect(mixed).toEqual([1, 0, 0, 0.5]);
  });
});

describe('transitions', () => {
  it('jumps when the node has not drawn yet', () => {
    const { surface, node } = surfaceWith({
      opacity: 1,
      backgroundColor: '#ffffff',
      transition: { property: 'opacity', duration: 100, easing: 'linear' },
    });
    node.style.opacity = 0.5;
    surface.update(100, 100, 1, 0);
    expect(opacity(surface)).toBe(0.5);
    expect(surface.needsPaint).toBe(false);
  });

  it('eases from the value shown to the new value, and draws until it ends', () => {
    const { surface, node } = surfaceWith({
      opacity: 1,
      backgroundColor: '#ffffff',
      transition: { property: 'opacity', duration: 100, easing: 'linear' },
    });
    surface.update(100, 100, 1, 0);
    node.style.opacity = 0;
    // The transition starts when the node next draws.
    surface.update(100, 100, 1, 1000);
    expect(opacity(surface)).toBe(1);
    expect(surface.needsPaint).toBe(true);
    surface.update(100, 100, 1, 1025);
    expect(opacity(surface)).toBeCloseTo(0.75);
    surface.update(100, 100, 1, 1100);
    expect(surface.stream.count).toBe(0);
    expect(surface.needsPaint).toBe(false);
  });

  it('turns round from where it is, with no jump', () => {
    const { surface, node } = surfaceWith({
      backgroundColor: '#000000',
      transition: {
        property: 'backgroundColor',
        duration: 100,
        easing: 'linear',
      },
    });
    surface.update(100, 100, 1, 0);
    node.style.backgroundColor = '#ffffff';
    surface.update(100, 100, 1, 0);
    surface.update(100, 100, 1, 50);
    expect(fill(surface)[0]).toBeCloseTo(0.5);
    node.style.backgroundColor = '#000000';
    surface.update(100, 100, 1, 50);
    expect(fill(surface)[0]).toBeCloseTo(0.5);
    surface.update(100, 100, 1, 100);
    expect(fill(surface)[0]).toBeCloseTo(0.25);
  });

  it('waits for the delay', () => {
    const { surface, node } = surfaceWith({
      opacity: 1,
      backgroundColor: '#ffffff',
      transition: {
        property: 'opacity',
        duration: 100,
        delay: 50,
        easing: 'linear',
      },
    });
    surface.update(100, 100, 1, 0);
    node.style.opacity = 0;
    surface.update(100, 100, 1, 0);
    surface.update(100, 100, 1, 50);
    expect(opacity(surface)).toBe(1);
    surface.update(100, 100, 1, 100);
    expect(opacity(surface)).toBeCloseTo(0.5);
  });

  it('moves a transform with no layout', () => {
    const { surface, node } = surfaceWith({
      backgroundColor: '#ffffff',
      transition: { property: 'transform', duration: 100, easing: 'linear' },
    });
    surface.update(100, 100, 1, 0);
    node.style.transform = { x: 20 };
    expect(surface.needsLayout).toBe(false);
    surface.update(100, 100, 1, 0);
    surface.update(100, 100, 1, 50);
    expect(surface.stream.data[0]).toBeCloseTo(10);
  });
});
