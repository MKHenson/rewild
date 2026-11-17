import { layoutTree } from './layout';
import { affectsLayout, UIStyle } from './style';
import { MeasureFunction, UINode } from './UINode';

function node(style: UIStyle, ...children: UINode[]): UINode {
  const n = new UINode({ style });
  n.append(...children);
  return n;
}

/** Lays out children in a root of 200 by 100 with the given style. */
function layout(rootStyle: UIStyle, ...children: UINode[]): UINode {
  const root = node(rootStyle, ...children);
  layoutTree(root, 200, 100);
  return root;
}

function rects(root: UINode) {
  return root.children.map((c) => c.rect);
}

function xs(root: UINode) {
  return root.children.map((c) => Math.round(c.rect.x * 100) / 100);
}

/** Ten words, each 20 px wide, in lines 10 px high. */
const words: MeasureFunction = (limit) => {
  const perLine = Math.max(1, Math.min(10, Math.floor(limit / 20)));
  return { width: perLine * 20, height: Math.ceil(10 / perLine) * 10 };
};

describe('absolute position', () => {
  function place(style: UIStyle, parentStyle: UIStyle = {}) {
    const child = node({ position: 'absolute', ...style });
    layout(parentStyle, child);
    return child.rect;
  }

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

  it('places inside the parent border, over the padding', () => {
    expect(
      place(
        { left: 0, top: 0, width: '100%', height: '100%' },
        { borderWidth: 5, padding: 10 }
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
    const child = node({
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 10,
      height: 10,
    });
    const parent = node(
      { position: 'absolute', left: 20, top: 10, width: 100, height: 50 },
      child
    );
    layout({}, parent);
    expect(child.rect).toEqual({ x: 110, y: 50, width: 10, height: 10 });
  });

  it('sizes to its content when no width is set', () => {
    const box = node(
      { position: 'absolute', left: 10, top: 10 },
      node({ width: 30, height: 10 }),
      node({ width: 40, height: 5 })
    );
    layout({}, box);
    expect(box.rect).toEqual({ x: 10, y: 10, width: 70, height: 10 });
  });

  it('shrinks its content to the space there is', () => {
    const box = node(
      { position: 'absolute', left: 0, top: 0 },
      new UINode({ measure: words }),
      new UINode({ measure: words })
    );
    layout({}, box);
    expect(box.rect.width).toBe(200);
    expect(rects(box).map((r) => r.width)).toEqual([100, 100]);
  });

  it('is never narrower than its min-content width', () => {
    const box = node(
      { position: 'absolute', left: 0, top: 0 },
      node({ width: 150 }),
      node({ width: 150 })
    );
    layout({}, box);
    expect(box.rect.width).toBe(300);
  });

  it('aligns with no insets as if it were the only flex item', () => {
    expect(
      place(
        { width: 20, height: 20 },
        { justifyContent: 'center', alignItems: 'center' }
      )
    ).toEqual({ x: 90, y: 40, width: 20, height: 20 });
    expect(place({ width: 20, height: 20 }, { padding: [5, 0, 0, 7] })).toEqual(
      { x: 7, y: 5, width: 20, height: 20 }
    );
  });

  it('takes no space in the flex line', () => {
    const root = layout(
      {},
      node({ position: 'absolute', width: 50 }),
      node({ width: 30 })
    );
    expect(root.children[1].rect.x).toBe(0);
  });
});

describe('flex direction', () => {
  it('places items in a row and stretches them', () => {
    const root = layout({}, node({ width: 50 }), node({ width: 30 }));
    expect(rects(root)).toEqual([
      { x: 0, y: 0, width: 50, height: 100 },
      { x: 50, y: 0, width: 30, height: 100 },
    ]);
  });

  it('places items in a column and stretches them', () => {
    const root = layout(
      { flexDirection: 'column' },
      node({ height: 20 }),
      node({ height: 30 })
    );
    expect(rects(root)).toEqual([
      { x: 0, y: 0, width: 200, height: 20 },
      { x: 0, y: 20, width: 200, height: 30 },
    ]);
  });

  it('places a reversed row from the right', () => {
    const root = layout(
      { flexDirection: 'row-reverse' },
      node({ width: 50 }),
      node({ width: 30 })
    );
    expect(xs(root)).toEqual([150, 120]);
  });

  it('places a reversed column from the bottom', () => {
    const root = layout(
      { flexDirection: 'column-reverse' },
      node({ height: 20 }),
      node({ height: 30 })
    );
    expect(root.children.map((c) => c.rect.y)).toEqual([80, 50]);
  });

  it('puts flex-end at the left of a reversed row', () => {
    const root = layout(
      { flexDirection: 'row-reverse', justifyContent: 'flex-end' },
      node({ width: 50 }),
      node({ width: 30 })
    );
    expect(xs(root)).toEqual([30, 0]);
  });
});

describe('gap, padding and margin', () => {
  it('puts the gap between items', () => {
    const root = layout(
      { gap: 10 },
      node({ width: 50 }),
      node({ width: 50 }),
      node({ width: 50 })
    );
    expect(xs(root)).toEqual([0, 60, 120]);
  });

  it('places items inside the padding and border', () => {
    const child = node({ width: 30 });
    const box = node(
      {
        position: 'absolute',
        width: 100,
        height: 60,
        padding: [5, 10, 15, 20],
        borderWidth: 2,
      },
      child
    );
    layout({}, box);
    expect(child.rect).toEqual({ x: 22, y: 7, width: 30, height: 36 });
    expect(box.padding).toEqual([5, 10, 15, 20]);
  });

  it('keeps margins around an item', () => {
    const child = node({ width: 50, margin: 10 });
    layout({}, child);
    expect(child.rect).toEqual({ x: 10, y: 10, width: 50, height: 80 });
    expect(child.margin).toEqual([10, 10, 10, 10]);
  });

  it('resolves percentage margins against the width on every side', () => {
    const child = node({ width: 50, margin: '10%' });
    layout({}, child);
    expect(child.rect).toEqual({ x: 20, y: 20, width: 50, height: 60 });
  });
});

describe('grow and shrink', () => {
  it('shares free space by grow factor', () => {
    const root = layout(
      {},
      node({ flexBasis: 0, flexGrow: 1 }),
      node({ flexBasis: 0, flexGrow: 3 })
    );
    expect(root.children.map((c) => c.rect.width)).toEqual([50, 150]);
  });

  it('adds free space to the base size', () => {
    const root = layout(
      {},
      node({ width: 20, flexGrow: 1 }),
      node({ width: 40, flexGrow: 1 })
    );
    expect(root.children.map((c) => c.rect.width)).toEqual([90, 110]);
  });

  it('shrinks equal items equally', () => {
    const root = layout({}, node({ width: 150 }), node({ width: 150 }));
    expect(root.children.map((c) => c.rect.width)).toEqual([100, 100]);
  });

  it('shrinks by shrink factor times base size', () => {
    const root = layout(
      {},
      node({ width: 150, flexShrink: 1 }),
      node({ width: 150, flexShrink: 3 })
    );
    expect(root.children.map((c) => c.rect.width)).toEqual([125, 75]);
  });

  it('shrinks by the base size inside the padding', () => {
    const root = layout(
      {},
      node({ width: 150, padding: [0, 0, 0, 50] }),
      node({ width: 150 })
    );
    expect(root.children.map((c) => c.rect.width)).toEqual([110, 90]);
  });

  it('does not shrink an item with a shrink factor of 0', () => {
    const root = layout(
      {},
      node({ width: 150, flexShrink: 0 }),
      node({ width: 150 })
    );
    expect(root.children.map((c) => c.rect.width)).toEqual([150, 50]);
  });

  it('gives the space a max size stops to the other items', () => {
    const root = layout(
      {},
      node({ flexGrow: 1, maxWidth: 50 }),
      node({ flexGrow: 1 })
    );
    expect(root.children.map((c) => c.rect.width)).toEqual([50, 150]);
  });

  it('takes the space a min size keeps from the other items', () => {
    const root = layout(
      {},
      node({ width: 150, minWidth: 140 }),
      node({ width: 150 })
    );
    expect(root.children.map((c) => c.rect.width)).toEqual([140, 60]);
  });

  it('is never smaller than its padding and border', () => {
    const root = layout(
      {},
      node({ width: 50, padding: [0, 40, 0, 40], borderWidth: 5 }),
      node({ width: 300 })
    );
    expect(root.children.map((c) => c.rect.width)).toEqual([90, 110]);
  });

  it('uses flexBasis over width', () => {
    const root = layout(
      {},
      node({ width: 20, flexBasis: 100 }),
      node({ flexBasis: '50%' })
    );
    expect(root.children.map((c) => c.rect.width)).toEqual([100, 100]);
  });
});

describe('justifyContent', () => {
  const cases: [UIStyle['justifyContent'], number[]][] = [
    ['flex-start', [0, 20, 40]],
    ['flex-end', [140, 160, 180]],
    ['center', [70, 90, 110]],
    ['space-between', [0, 90, 180]],
    ['space-around', [23.33, 90, 156.67]],
    ['space-evenly', [35, 90, 145]],
  ];
  it.each(cases)('places items for %s', (justifyContent, expected) => {
    const root = layout(
      { justifyContent },
      node({ width: 20 }),
      node({ width: 20 }),
      node({ width: 20 })
    );
    expect(xs(root)).toEqual(expected);
  });

  it('starts items that overflow for space-around, as safe center', () => {
    const root = layout(
      { justifyContent: 'space-around' },
      node({ width: 300, flexShrink: 0 })
    );
    expect(xs(root)).toEqual([0]);
  });
});

describe('alignItems and alignSelf', () => {
  // The y of an item 30 high, then the y and height of an item with no height.
  const cases: [UIStyle['alignItems'], number, number, number][] = [
    ['flex-start', 0, 0, 0],
    ['flex-end', 70, 100, 0],
    ['center', 35, 50, 0],
    ['stretch', 0, 0, 100],
  ];
  it.each(cases)('places items for %s', (alignItems, y, autoY, autoHeight) => {
    const fixed = node({ width: 20, height: 30 });
    const auto = node({ width: 20 });
    layout({ alignItems }, fixed, auto);
    expect(fixed.rect.y).toBe(y);
    expect(auto.rect.y).toBe(autoY);
    expect(auto.rect.height).toBe(autoHeight);
  });

  it('lets an item override the container', () => {
    const child = node({ width: 20, height: 30, alignSelf: 'flex-end' });
    layout({ alignItems: 'flex-start' }, child);
    expect(child.rect.y).toBe(70);
  });

  it('stretches within min and max', () => {
    const child = node({ width: 20, maxHeight: 40 });
    layout({}, child);
    expect(child.rect.height).toBe(40);
  });
});

describe('flexWrap', () => {
  it('breaks lines and shares the cross space between them', () => {
    const root = layout(
      { flexWrap: 'wrap', gap: 10 },
      node({ width: 80, height: 20 }),
      node({ width: 80, height: 20 }),
      node({ width: 80, height: 20 })
    );
    expect(rects(root)).toEqual([
      { x: 0, y: 0, width: 80, height: 20 },
      { x: 90, y: 0, width: 80, height: 20 },
      { x: 0, y: 55, width: 80, height: 20 },
    ]);
  });

  it('stretches items to their line', () => {
    const root = layout(
      { flexWrap: 'wrap' },
      node({ width: 120 }),
      node({ width: 120 })
    );
    expect(rects(root)).toEqual([
      { x: 0, y: 0, width: 120, height: 50 },
      { x: 0, y: 50, width: 120, height: 50 },
    ]);
  });

  it('keeps one line without wrap and shrinks the items', () => {
    const root = layout({}, node({ width: 120 }), node({ width: 120 }));
    expect(xs(root)).toEqual([0, 100]);
  });
});

describe('sizes from the content', () => {
  it('sizes a column from its children, padding and margins', () => {
    const inner = node(
      { flexDirection: 'column', padding: 5 },
      node({ height: 20 }),
      node({ height: 30, margin: [4, 0, 6, 0] })
    );
    layout({ flexDirection: 'column' }, inner);
    expect(inner.rect).toEqual({ x: 0, y: 0, width: 200, height: 70 });
  });

  it('sizes a row item from its children', () => {
    const inner = node({}, node({ width: 40, margin: 5 }));
    layout({}, inner);
    expect(inner.rect.width).toBe(50);
  });

  it('resolves percentages of an unknown size as auto', () => {
    const inner = node(
      { flexDirection: 'column' },
      node({ height: '50%' }),
      node({ height: 20 })
    );
    layout({ flexDirection: 'column', alignItems: 'flex-start' }, inner);
    expect(inner.rect.height).toBe(20);
  });

  it('measures a leaf at its max content size', () => {
    const text = new UINode({ measure: words });
    layout({ alignItems: 'flex-start' }, text);
    expect(text.rect).toEqual({ x: 0, y: 0, width: 200, height: 10 });
  });

  it('measures again at the width an item shrinks to', () => {
    const text = new UINode({ measure: words });
    layout(
      { alignItems: 'flex-start' },
      text,
      node({ width: 100, flexShrink: 0 })
    );
    expect(text.rect).toEqual({ x: 0, y: 0, width: 100, height: 20 });
  });

  it('measures at the stretched width in a column', () => {
    const text = new UINode({ measure: words, style: { padding: 10 } });
    layout({ flexDirection: 'column' }, text);
    expect(text.rect).toEqual({ x: 0, y: 0, width: 200, height: 40 });
  });
});

describe('browser rules', () => {
  it('resolves a percentage height against a stretched item', () => {
    const child = node({ width: 10, height: '50%' });
    layout({}, node({}, child));
    expect(child.rect.height).toBe(50);
  });

  it('does not stretch an item whose percentage height cannot resolve', () => {
    const percent = node({ width: 10, height: '50%' });
    const box = node(
      { alignSelf: 'flex-start' },
      percent,
      node({ width: 10, height: 40 })
    );
    layout({}, box);
    expect(box.rect.height).toBe(40);
    expect(percent.rect.height).toBe(0);
  });

  it('grows from a content basis that its min width does not clamp', () => {
    const child = node({ minWidth: 50, flexGrow: 0.5 });
    layout({}, node({ width: 81 }, child));
    expect(child.rect.width).toBe(50);
  });

  it('sizes a container to an item content only when its factors allow', () => {
    const width = (style: UIStyle) => {
      const box = node(
        { position: 'absolute' },
        node({ width: 25, flexBasis: 11, ...style })
      );
      layout({}, box);
      return box.rect.width;
    };
    expect(width({})).toBe(11);
    expect(width({ flexGrow: 1 })).toBe(25);
  });

  it('aligns an absolute box between top and bottom by alignSelf', () => {
    const box = node(
      { position: 'absolute', top: 10, bottom: 10, alignSelf: 'center' },
      node({ width: 10, height: 20 })
    );
    layout({}, box);
    expect(box.rect).toEqual({ x: 0, y: 40, width: 10, height: 20 });
  });

  it('overflows a reversed row from the left for space-evenly', () => {
    const root = layout(
      { flexDirection: 'row-reverse', justifyContent: 'space-evenly' },
      node({ width: 300, flexShrink: 0 })
    );
    expect(xs(root)).toEqual([0]);
  });
});

describe('position relative and display none', () => {
  it('moves an item by its insets without moving the others', () => {
    const root = layout(
      {},
      node({ width: 50, left: 5, top: 3 }),
      node({ width: 50, right: 10 })
    );
    expect(rects(root)).toEqual([
      { x: 5, y: 3, width: 50, height: 100 },
      { x: 40, y: 0, width: 50, height: 100 },
    ]);
  });

  it('removes a node with display none from the line', () => {
    const root = layout(
      { gap: 10 },
      node({ width: 50 }),
      node({ width: 50, display: 'none' }),
      node({ width: 50 })
    );
    expect(xs(root)).toEqual([0, 0, 60]);
    expect(root.children[1].rect.width).toBe(0);
  });
});

describe('affectsLayout', () => {
  it('is true for flex properties and false for colours', () => {
    expect(affectsLayout('gap')).toBe(true);
    expect(affectsLayout('flexGrow')).toBe(true);
    expect(affectsLayout('backgroundColor')).toBe(false);
  });
});
