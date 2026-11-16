import { Dirty, UINode } from './UINode';
import { UISurface } from './UISurface';

function tree() {
  const surface = new UISurface({ kind: 'screen', name: 'test' });
  const a = new UINode({ style: { width: 10, height: 10 } });
  const b = new UINode();
  const c = new UINode();
  a.append(b);
  surface.root.append(a, c);
  surface.update(100, 100);
  return { surface, a, b, c };
}

describe('UINode tree', () => {
  it('appends children in order', () => {
    const parent = new UINode();
    const a = new UINode();
    const b = new UINode();
    parent.append(a, b);
    expect(parent.children).toEqual([a, b]);
    expect(a.parent).toBe(parent);
  });

  it('inserts before a reference child', () => {
    const parent = new UINode();
    const a = new UINode();
    const b = new UINode();
    parent.append(b);
    parent.insertBefore(a, b);
    expect(parent.children).toEqual([a, b]);
  });

  it('moves a node that already has a parent', () => {
    const first = new UINode();
    const second = new UINode();
    const child = new UINode();
    first.append(child);
    second.append(child);
    expect(first.children).toEqual([]);
    expect(second.children).toEqual([child]);
  });

  it('removes a node from its parent', () => {
    const parent = new UINode();
    const child = new UINode();
    parent.append(child);
    child.remove();
    expect(parent.children).toEqual([]);
    expect(child.parent).toBeNull();
  });

  it('replaces the children', () => {
    const parent = new UINode();
    const old = new UINode();
    const next = new UINode();
    parent.append(old);
    parent.replaceChildren(next);
    expect(parent.children).toEqual([next]);
    expect(old.parent).toBeNull();
  });

  it('rejects a reference node that is not a child', () => {
    expect(() =>
      new UINode().insertBefore(new UINode(), new UINode())
    ).toThrow();
  });

  it('rejects appending an ancestor', () => {
    const parent = new UINode();
    const child = new UINode();
    parent.append(child);
    expect(() => child.append(parent)).toThrow();
  });

  it('finds its surface through the root', () => {
    const { surface, b } = tree();
    expect(b.surface).toBe(surface);
    b.remove();
    expect(b.surface).toBeNull();
  });
});

describe('UINode dirty flags', () => {
  it('starts clean after an update', () => {
    const { surface, a, b, c } = tree();
    for (const node of [surface.root, a, b, c])
      expect(node.dirty).toBe(Dirty.None);
    expect(surface.needsLayout).toBe(false);
    expect(surface.needsPaint).toBe(false);
  });

  it('marks only the changed node for paint on a colour change', () => {
    const { surface, a, b, c } = tree();
    b.style.backgroundColor = '#ff0000';
    expect(b.dirty).toBe(Dirty.Paint);
    for (const node of [surface.root, a, c])
      expect(node.dirty).toBe(Dirty.None);
    expect(surface.needsPaint).toBe(true);
    expect(surface.needsLayout).toBe(false);
  });

  it('marks layout on a size change', () => {
    const { surface, a, c } = tree();
    a.style.width = 20;
    expect(a.dirty).toBe(Dirty.Layout | Dirty.Paint);
    expect(c.dirty).toBe(Dirty.None);
    expect(surface.needsLayout).toBe(true);
  });

  it('ignores a value that does not change', () => {
    const { surface, a } = tree();
    a.style.width = 10;
    expect(a.dirty).toBe(Dirty.None);
    expect(surface.needsLayout).toBe(false);
  });

  it('marks the parent when a child is removed', () => {
    const { surface, a, b, c } = tree();
    b.remove();
    expect(a.dirty).toBe(Dirty.Layout | Dirty.Paint);
    expect(c.dirty).toBe(Dirty.None);
    expect(surface.needsLayout).toBe(true);
  });

  it('marks a deleted style property', () => {
    const { a } = tree();
    delete a.style.width;
    expect(a.dirty).toBe(Dirty.Layout | Dirty.Paint);
  });
});
