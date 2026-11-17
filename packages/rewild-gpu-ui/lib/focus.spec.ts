import {
  canFocus,
  focusableAncestor,
  focusableNodes,
  nearestInDirection,
  nextInTabOrder,
} from './focus';
import { PRIMITIVE_FLOATS } from './stream';
import { Rect, UINode } from './UINode';
import { UISurface } from './UISurface';

function button(left: number, top: number, width = 40, height = 20): UINode {
  return new UINode({
    style: {
      position: 'absolute',
      left,
      top,
      width,
      height,
      focusable: true,
    },
  });
}

/**
 * A 3 by 2 grid of buttons, 40 by 20 with 10 px gaps:
 *
 *     a b c
 *     d e f
 */
function grid() {
  const surface = new UISurface({ kind: 'screen', name: 'test', input: 'all' });
  const [a, b, c] = [0, 50, 100].map((x) => button(x, 0));
  const [d, e, f] = [0, 50, 100].map((x) => button(x, 30));
  surface.root.append(a, b, c, d, e, f);
  surface.update(200, 100);
  return { surface, nodes: [a, b, c, d, e, f], a, b, c, d, e, f };
}

describe('focusable nodes', () => {
  it('lists the nodes that show, in tree order', () => {
    const root = new UINode();
    const hidden = new UINode({ style: { display: 'none' } });
    const inside = new UINode({ style: { focusable: true } });
    const first = new UINode({ style: { focusable: true } });
    const last = new UINode({ style: { focusable: true } });
    hidden.append(inside);
    root.append(first, hidden, last);
    expect(focusableNodes(root)).toEqual([first, last]);
    expect(canFocus(inside)).toBe(false);
  });

  it('finds the nearest focusable ancestor', () => {
    const outer = new UINode({ style: { focusable: true } });
    const label = new UINode();
    outer.append(label);
    expect(focusableAncestor(label)).toBe(outer);
    expect(focusableAncestor(new UINode())).toBeNull();
  });
});

describe('nextInTabOrder', () => {
  const { nodes, a, b, f } = grid();

  it('steps forward and back, and wraps', () => {
    expect(nextInTabOrder(nodes, a, false)).toBe(b);
    expect(nextInTabOrder(nodes, a, true)).toBe(f);
    expect(nextInTabOrder(nodes, f, false)).toBe(a);
  });

  it('starts at an end with no current node', () => {
    expect(nextInTabOrder(nodes, null, false)).toBe(a);
    expect(nextInTabOrder(nodes, null, true)).toBe(f);
    expect(nextInTabOrder([], null, false)).toBeNull();
  });
});

describe('nearestInDirection', () => {
  const { nodes, a, b, c, d, e } = grid();
  const others = (node: UINode) => nodes.filter((n) => n !== node);

  it('moves to the neighbour on each side', () => {
    expect(nearestInDirection(others(e), e.rect, 'left')).toBe(d);
    expect(nearestInDirection(others(e), e.rect, 'up')).toBe(b);
    expect(nearestInDirection(others(b), b.rect, 'right')).toBe(c);
    expect(nearestInDirection(others(a), a.rect, 'down')).toBe(d);
  });

  it('finds nothing past the edge', () => {
    expect(nearestInDirection(others(a), a.rect, 'left')).toBeNull();
    expect(nearestInDirection(others(a), a.rect, 'up')).toBeNull();
  });

  it('prefers a node in line over a nearer one to the side', () => {
    const from = { x: 0, y: 0, width: 40, height: 20 };
    const inLine = at({ x: 150, y: 0, width: 40, height: 20 });
    const aside = at({ x: 50, y: 60, width: 40, height: 20 });
    expect(nearestInDirection([aside, inLine], from, 'right')).toBe(inLine);
  });

  it('prefers the centred node when both overlap across the move', () => {
    const from = { x: 0, y: 40, width: 40, height: 20 };
    const centred = at({ x: 10, y: 0, width: 20, height: 35 });
    const offset = at({ x: 30, y: 0, width: 20, height: 35 });
    expect(nearestInDirection([offset, centred], from, 'up')).toBe(centred);
  });
});

/** A node with a rect, as layout would write it. */
function at(rect: Rect): UINode {
  const node = new UINode({ style: { focusable: true } });
  node.rect = rect;
  return node;
}

describe('surface focus', () => {
  it('sends blur to the old node, then focus to the new one', () => {
    const { surface, a, b } = grid();
    const log: string[] = [];
    a.on('focus', (e) => log.push(`a focus from ${e.relatedTarget && 'b'}`));
    a.on('blur', () => log.push('a blur'));
    b.on('focus', (e) => log.push(`b focus from ${e.relatedTarget === a}`));
    a.focus();
    b.focus();
    expect(log).toEqual(['a focus from null', 'a blur', 'b focus from true']);
    expect(b.focused).toBe(true);
    b.blur();
    expect(surface.focused).toBeNull();
  });

  it('does not focus a node that is not focusable or not on the surface', () => {
    const { surface } = grid();
    const plain = new UINode();
    surface.root.append(plain);
    plain.focus();
    expect(surface.focused).toBeNull();
    expect(surface.setFocus(button(0, 0))).toBe(false);
  });

  it('forgets a focused node that leaves the tree or hides', () => {
    const { surface, a, b } = grid();
    a.focus();
    a.remove();
    expect(surface.focused).toBeNull();
    b.focus();
    b.style.display = 'none';
    expect(surface.focused).toBeNull();
  });

  it('draws the focus ring only when focus is visible', () => {
    const { surface, a } = grid();
    a.focus();
    surface.update(200, 100);
    expect(surface.stream.count).toBe(0);
    a.focus({ focusVisible: true });
    expect(surface.focusVisible).toBe(true);
    surface.update(200, 100);
    expect(surface.stream.count).toBe(1);
    const d = Array.from(surface.stream.data.subarray(0, PRIMITIVE_FLOATS));
    // The ring is 2 px outside the 40 by 20 box: a 2 px border with no fill.
    expect(d.slice(0, 4)).toEqual([-2, -2, 44, 24]);
    expect(d[19]).toBe(0);
    expect(d[24]).toBe(2);
  });
});
