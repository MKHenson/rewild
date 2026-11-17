import { UIColor, UINode, UIStyle } from '../../lib';
import { example } from '../registry';

const part = 'Layout';
const colours: UIColor[] = ['#1a5c8e', '#2d8f92', '#d8942d', '#972222'];

function box(style: UIStyle, ...children: UINode[]): UINode {
  const node = new UINode({ style });
  node.append(...children);
  return node;
}

/** A container with a thin border, so its own box shows. */
function frame(style: UIStyle, ...children: UINode[]): UINode {
  return box(
    { borderWidth: 1, borderColor: '#999999', borderRadius: 4, ...style },
    ...children
  );
}

/** Coloured items, one per style. */
function items(...styles: UIStyle[]): UINode[] {
  return styles.map((style, i) =>
    box({
      backgroundColor: colours[i % colours.length],
      borderRadius: 4,
      ...style,
    })
  );
}

const pad: UIStyle = { padding: 16, gap: 12 };

example({
  part,
  name: 'Row and column',
  description:
    'A row and a column of three items. Items with no cross size stretch to fill it.',
  build: ({ surface }) => {
    Object.assign(surface.root.style, pad);
    surface.root.append(
      frame(
        { flexGrow: 1, gap: 8, padding: 8 },
        ...items({ width: 40 }, { width: 60, height: 40 }, { width: 80 })
      ),
      frame(
        { flexGrow: 1, flexDirection: 'column', gap: 8, padding: 8 },
        ...items({ height: 30 }, { height: 40, width: 60 }, { height: 50 })
      )
    );
  },
});

example({
  part,
  name: 'Grow, shrink and basis',
  description:
    'Grow factors of 1, 2 and 1. Then items of 200 px that shrink by factors of 1, 1 and 3. Then the same items with the first at a shrink of 0.',
  height: 200,
  build: ({ surface }) => {
    Object.assign(surface.root.style, pad, { flexDirection: 'column' });
    const row = (...children: UINode[]) =>
      frame({ height: 40, gap: 4, padding: 4 }, ...children);
    surface.root.append(
      row(
        ...items(
          { flexBasis: 0, flexGrow: 1 },
          { flexBasis: 0, flexGrow: 2 },
          { flexBasis: 0, flexGrow: 1 }
        )
      ),
      row(
        ...items({ width: 200 }, { width: 200 }, { width: 200, flexShrink: 3 })
      ),
      row(
        ...items(
          { width: 200, flexShrink: 0 },
          { width: 200 },
          { width: 200, flexShrink: 3 }
        )
      )
    );
  },
});

example({
  part,
  name: 'Min and max',
  description:
    'Growing items where the first stops at a max width of 80 px. Then shrinking items where the first keeps a min width of 260 px.',
  height: 150,
  build: ({ surface }) => {
    Object.assign(surface.root.style, pad, { flexDirection: 'column' });
    const row = (...children: UINode[]) =>
      frame({ height: 40, gap: 4, padding: 4 }, ...children);
    surface.root.append(
      row(
        ...items(
          { flexGrow: 1, maxWidth: 80 },
          { flexGrow: 1 },
          { flexGrow: 1 }
        )
      ),
      row(
        ...items({ width: 300, minWidth: 260 }, { width: 300 }, { width: 300 })
      )
    );
  },
});

example({
  part,
  name: 'Justify content',
  description:
    'flex-start, flex-end, center, space-between, space-around and space-evenly.',
  height: 300,
  build: ({ surface }) => {
    Object.assign(surface.root.style, pad, {
      flexDirection: 'column',
      gap: 8,
    });
    const values: UIStyle['justifyContent'][] = [
      'flex-start',
      'flex-end',
      'center',
      'space-between',
      'space-around',
      'space-evenly',
    ];
    surface.root.append(
      ...values.map((justifyContent) =>
        frame(
          { height: 36, padding: 4, justifyContent },
          ...items({ width: 40 }, { width: 60 }, { width: 40 })
        )
      )
    );
  },
});

example({
  part,
  name: 'Align items',
  description:
    'flex-start, flex-end, center and stretch, with items of no height, 30 px and 50 px. In the last box, the middle item sets alignSelf to center.',
  height: 200,
  build: ({ surface }) => {
    Object.assign(surface.root.style, pad);
    const values: UIStyle['alignItems'][] = [
      'flex-start',
      'flex-end',
      'center',
      'stretch',
    ];
    surface.root.append(
      ...values.map((alignItems) =>
        frame(
          { flexGrow: 1, flexBasis: 0, gap: 4, padding: 4, alignItems },
          ...items(
            { width: 20, minHeight: 10 },
            { width: 20, height: 30 },
            { width: 20, height: 50 }
          )
        )
      ),
      frame(
        { flexGrow: 1, flexBasis: 0, gap: 4, padding: 4 },
        ...items(
          { width: 20 },
          { width: 20, height: 30, alignSelf: 'center' },
          { width: 20 }
        )
      )
    );
  },
});

example({
  part,
  name: 'Wrap',
  description:
    'Fixed slots in a wrapped row, like an inventory. Then items with no height, which stretch to their line. Resize the window to see the lines change.',
  height: 260,
  build: ({ surface }) => {
    Object.assign(surface.root.style, pad);
    surface.root.append(
      frame(
        { flexGrow: 1, flexBasis: 0, flexWrap: 'wrap', gap: 6, padding: 6 },
        ...items(
          ...Array.from({ length: 14 }, () => ({ width: 40, height: 40 }))
        )
      ),
      frame(
        { flexGrow: 1, flexBasis: 0, flexWrap: 'wrap', gap: 6, padding: 6 },
        ...items({ width: 120 }, { width: 80 }, { width: 100 }, { width: 60 })
      )
    );
  },
});

example({
  part,
  name: 'Padding, margin and gap',
  description:
    'Per side padding of 8, 24, 8 and 40 px. Items with margins of 0, 12 px and 20 px. Turn on the layout overlay to see each one.',
  build: ({ surface }) => {
    Object.assign(surface.root.style, pad);
    surface.root.append(
      frame(
        { flexGrow: 1, padding: [8, 24, 8, 40], gap: 8, alignItems: 'center' },
        ...items(
          { width: 60, height: 60 },
          { width: 60, height: 60, margin: 12 },
          { width: 60, height: 60, margin: [0, 0, 0, 20] },
          { flexGrow: 1, alignSelf: 'stretch', margin: 20 }
        )
      )
    );
  },
});

example({
  part,
  name: 'Reverse',
  description:
    'row-reverse and column-reverse. The first item is the widest and the tallest.',
  build: ({ surface }) => {
    Object.assign(surface.root.style, pad);
    surface.root.append(
      frame(
        { flexGrow: 1, flexDirection: 'row-reverse', gap: 8, padding: 8 },
        ...items({ width: 80 }, { width: 50 }, { width: 30 })
      ),
      frame(
        { flexGrow: 1, flexDirection: 'column-reverse', gap: 8, padding: 8 },
        ...items({ height: 60 }, { height: 40 }, { height: 20 })
      )
    );
  },
});

example({
  part,
  name: 'Sizes from the content',
  description:
    'Boxes with no width or height take the size of their children. An absolute box with no width shrinks to fit its content.',
  build: ({ surface }) => {
    Object.assign(surface.root.style, pad, { alignItems: 'flex-start' });
    surface.root.append(
      frame(
        { padding: 8, gap: 8 },
        ...items({ width: 30, height: 30 }, { width: 50, height: 50 })
      ),
      frame(
        { flexDirection: 'column', padding: 8, gap: 8 },
        ...items({ width: 80, height: 20 }, { width: 40, height: 40 })
      ),
      frame(
        { position: 'absolute', right: 16, bottom: 16, padding: 12, gap: 6 },
        ...items(
          { width: 20, height: 20 },
          { width: 20, height: 20 },
          { width: 20, height: 20 }
        )
      )
    );
  },
});

example({
  part,
  name: 'Absolute in flex',
  description:
    'The HUD bars from the plan: absolute, 24 px from the bottom, 30% from the left and 40% wide, in a column. A box with no insets is centred by its parent, as the only flex item.',
  height: 200,
  build: ({ surface }) => {
    Object.assign(surface.root.style, {
      justifyContent: 'center',
      alignItems: 'center',
    });
    surface.root.append(
      box({
        position: 'absolute',
        width: 60,
        height: 60,
        borderWidth: 2,
        borderColor: '#999999',
        borderRadius: 30,
      }),
      box(
        {
          position: 'absolute',
          bottom: 24,
          left: '30%',
          width: '40%',
          flexDirection: 'column',
          gap: 4,
        },
        ...items(
          { height: 20, borderRadius: 20, backgroundColor: '#972222' },
          { height: 12, borderRadius: 12, backgroundColor: '#d8942d' },
          { height: 12, borderRadius: 12, backgroundColor: '#1a5c8e' }
        )
      )
    );
  },
});

example({
  part,
  name: 'Percentages and display none',
  description:
    'Items of 25%, 50% and 25% wide, with heights of 100%, 50% and 75%. Then a row whose second item has display none, so the others close up.',
  build: ({ surface }) => {
    Object.assign(surface.root.style, pad, {
      flexDirection: 'column',
      gap: 8,
    });
    surface.root.append(
      frame(
        { flexGrow: 1, alignItems: 'flex-end' },
        ...items(
          { width: '25%', height: '100%' },
          { width: '50%', height: '50%' },
          { width: '25%', height: '75%' }
        )
      ),
      frame(
        { height: 40, gap: 8, padding: 4 },
        ...items(
          { width: 60 },
          { width: 60, display: 'none' },
          { width: 60 },
          { width: 60 }
        )
      )
    );
  },
});
