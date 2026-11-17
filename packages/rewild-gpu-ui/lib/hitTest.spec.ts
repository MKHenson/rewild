import { hitTest, insideRounded } from './hitTest';
import { UIStyle } from './style';
import { UINode } from './UINode';
import { UISurface } from './UISurface';

function surfaceWith(...nodes: UINode[]) {
  const surface = new UISurface({ kind: 'screen', name: 'test' });
  surface.root.append(...nodes);
  surface.update(200, 200);
  return surface;
}

function box(style: UIStyle, ...children: UINode[]): UINode {
  const node = new UINode({ style: { position: 'absolute', ...style } });
  node.append(...children);
  return node;
}

describe('insideRounded', () => {
  const rect = { x: 0, y: 0, width: 100, height: 50 };

  it('takes the left and top edges, not the right and bottom', () => {
    expect(insideRounded(0, 0, rect, [0, 0, 0, 0])).toBe(true);
    expect(insideRounded(100, 10, rect, [0, 0, 0, 0])).toBe(false);
    expect(insideRounded(10, 50, rect, [0, 0, 0, 0])).toBe(false);
  });

  it('cuts each corner by its own radius', () => {
    const radii: [number, number, number, number] = [20, 0, 10, 0];
    expect(insideRounded(2, 2, rect, radii)).toBe(false);
    expect(insideRounded(8, 8, rect, radii)).toBe(true);
    expect(insideRounded(99, 1, rect, radii)).toBe(true);
    expect(insideRounded(99, 49, rect, radii)).toBe(false);
    expect(insideRounded(1, 49, rect, radii)).toBe(true);
  });
});

describe('hitTest', () => {
  it('finds the topmost node, so a later child wins', () => {
    const under = box({ left: 0, top: 0, width: 100, height: 100 });
    const over = box({ left: 50, top: 50, width: 100, height: 100 });
    const surface = surfaceWith(under, over);
    expect(hitTest(surface.root, 75, 75)).toBe(over);
    expect(hitTest(surface.root, 25, 25)).toBe(under);
    expect(hitTest(surface.root, 180, 20)).toBe(surface.root);
  });

  it('finds a nested node before its parent', () => {
    const child = box({ left: 10, top: 10, width: 20, height: 20 });
    const parent = box({ left: 10, top: 10, width: 100, height: 100 }, child);
    const surface = surfaceWith(parent);
    expect(hitTest(surface.root, 25, 25)).toBe(child);
    expect(hitTest(surface.root, 60, 60)).toBe(parent);
  });

  it('misses the cut corners of a rounded box', () => {
    const round = box({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      borderRadius: 50,
    });
    const surface = surfaceWith(round);
    expect(hitTest(surface.root, 5, 5)).toBe(surface.root);
    expect(hitTest(surface.root, 50, 50)).toBe(round);
  });

  it('clips children to the inside of an overflow hidden parent', () => {
    const child = box({ left: 0, top: 0, width: 200, height: 200 });
    const parent = box(
      {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        borderWidth: 10,
        overflow: 'hidden',
      },
      child
    );
    const surface = surfaceWith(parent);
    expect(hitTest(surface.root, 50, 50)).toBe(child);
    // In the parent's border, outside its clip.
    expect(hitTest(surface.root, 5, 50)).toBe(parent);
    // Past the parent, where the child would be without the clip.
    expect(hitTest(surface.root, 150, 150)).toBe(surface.root);
  });

  it('clips children by the inner corner radius', () => {
    const child = box({ left: 0, top: 0, width: 100, height: 100 });
    const parent = box(
      {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        borderRadius: 40,
        overflow: 'hidden',
      },
      child
    );
    const surface = surfaceWith(parent);
    expect(hitTest(surface.root, 3, 3)).toBe(surface.root);
    expect(hitTest(surface.root, 50, 50)).toBe(child);
  });

  it('skips a node with pointerEvents none, but not its children', () => {
    const child = box({ left: 0, top: 0, width: 20, height: 20 });
    const parent = box(
      { left: 0, top: 0, width: 100, height: 100, pointerEvents: 'none' },
      child
    );
    const surface = surfaceWith(parent);
    expect(hitTest(surface.root, 10, 10)).toBe(child);
    expect(hitTest(surface.root, 50, 50)).toBe(surface.root);
  });

  it('skips a node with display none and its children', () => {
    const child = box({ left: 0, top: 0, width: 20, height: 20 });
    const parent = box(
      { left: 0, top: 0, width: 100, height: 100, display: 'none' },
      child
    );
    const surface = surfaceWith(parent);
    expect(hitTest(surface.root, 10, 10)).toBe(surface.root);
  });
});
