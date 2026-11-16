import { layoutTree } from './layout';
import { UIStyle } from './style';
import { UINode } from './UINode';

function place(style: UIStyle, parentStyle: UIStyle = {}) {
  const root = new UINode({ style: parentStyle });
  const child = new UINode({ style: { position: 'absolute', ...style } });
  root.append(child);
  layoutTree(root, 200, 100);
  return child.rect;
}

describe('layoutTree', () => {
  it('fills the surface with the root', () => {
    const root = new UINode();
    layoutTree(root, 200, 100);
    expect(root.rect).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it('places by left and top', () => {
    expect(place({ left: 10, top: 20, width: 30, height: 40 })).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    });
  });

  it('places by right and bottom', () => {
    expect(place({ right: 10, bottom: 20, width: 30, height: 40 })).toEqual({
      x: 160,
      y: 40,
      width: 30,
      height: 40,
    });
  });

  it('stretches between left and right', () => {
    expect(place({ left: 10, right: 30, top: 0, height: 5 })).toEqual({
      x: 10,
      y: 0,
      width: 160,
      height: 5,
    });
  });

  it('prefers left over right when both and a width are set', () => {
    expect(place({ left: 10, right: 30, width: 50 }).x).toBe(10);
  });

  it('resolves percentages against the parent', () => {
    expect(
      place({ left: '30%', top: '10%', width: '40%', height: '50%' })
    ).toEqual({ x: 60, y: 10, width: 80, height: 50 });
  });

  it('places inside the parent border', () => {
    expect(
      place(
        { left: 0, top: 0, width: '100%', height: '100%' },
        { borderWidth: 5 }
      )
    ).toEqual({ x: 5, y: 5, width: 190, height: 90 });
  });

  it('gives an empty box no size when nothing sets it', () => {
    expect(place({ left: 10, top: 10 })).toEqual({
      x: 10,
      y: 10,
      width: 0,
      height: 0,
    });
  });

  it('places nested boxes relative to their parent', () => {
    const root = new UINode();
    const parent = new UINode({
      style: {
        position: 'absolute',
        left: 20,
        top: 10,
        width: 100,
        height: 50,
      },
    });
    const child = new UINode({
      style: {
        position: 'absolute',
        right: 0,
        bottom: 0,
        width: 10,
        height: 10,
      },
    });
    parent.append(child);
    root.append(parent);
    layoutTree(root, 200, 100);
    expect(child.rect).toEqual({ x: 110, y: 50, width: 10, height: 10 });
  });

  it('puts a relative node at the top left, at full width', () => {
    const root = new UINode();
    const child = new UINode({ style: { height: 20, left: 5 } });
    root.append(child);
    layoutTree(root, 200, 100);
    expect(child.rect).toEqual({ x: 5, y: 0, width: 200, height: 20 });
  });
});
