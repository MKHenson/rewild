import { UIColor, UINode, UIStyle } from '../../lib';
import { example } from '../registry';

const part = 'Scrolling';
const colours: UIColor[] = ['#1a5c8e', '#2d8f92', '#d8942d', '#972222'];

/** A scroll container with a thin border, so its own box shows. */
function scroller(style: UIStyle, children: UINode[]): UINode {
  const node = new UINode({
    style: {
      overflow: 'scroll',
      borderWidth: 1,
      borderColor: '#999999',
      borderRadius: 4,
      padding: 8,
      gap: 8,
      ...style,
    },
  });
  node.append(...children);
  return node;
}

/** Coloured items that take focus, so the arrow keys and the d-pad scroll to them. */
function items(count: number, style: UIStyle): UINode[] {
  return Array.from(
    { length: count },
    (_, i) =>
      new UINode({
        style: {
          backgroundColor: colours[i % colours.length],
          borderRadius: 4,
          focusable: true,
          ...style,
        },
      })
  );
}

example({
  part,
  name: 'Columns, rows and both',
  description:
    'Each box scrolls on the axes its content overflows. Use the wheel, Shift and the wheel, a touch drag, or drag a scrollbar. The arrow keys and the d-pad move focus and scroll it into view, and the right stick scrolls. The DOM side scrolls on its own.',
  height: 220,
  build: ({ surface }) => {
    surface.input = 'all';
    Object.assign(surface.root.style, { padding: 16, gap: 12 });
    const grid = new UINode({
      // Content width, so the container scrolls across it. A scroll
      // container measures its children, not their own overflow.
      style: { flexDirection: 'column', gap: 8, alignSelf: 'flex-start' },
    });
    for (let row = 0; row < 6; row++) {
      const line = new UINode({ style: { gap: 8 } });
      line.append(...items(6, { width: 60, height: 40, flexShrink: 0 }));
      grid.append(line);
    }
    surface.root.append(
      scroller(
        { flexDirection: 'column', width: 140, height: 180 },
        items(8, { height: 40 })
      ),
      scroller({ width: 200, height: 70 }, items(8, { width: 60 })),
      scroller({ flexDirection: 'column', width: 220, height: 180 }, [grid])
    );
  },
});
