import { Grid, Image, UINode, UIStyle } from '../../lib';
import { example } from '../registry';
import { panel } from '../standIns';

const part = 'Grid';

/** A numbered tile. */
function tile(index: number, style: UIStyle = {}): UINode {
  const node = new UINode({
    name: `cell ${index}`,
    style: {
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 6,
      backgroundColor: '#24323f',
      borderWidth: 1,
      borderColor: '#3d5266',
      ...style,
    },
  });
  node.append(
    new UINode({
      text: String(index + 1),
      style: { fontSize: 14, color: '#c5d3e0', pointerEvents: 'none' },
    })
  );
  return node;
}

function page(...children: UINode[]): UINode {
  const node = new UINode({
    style: { padding: 16, alignItems: 'flex-start' },
  });
  node.append(...children);
  return node;
}

example({
  part,
  name: 'Cells',
  description:
    'A 6 by 4 grid of 48 px square cells with a gap of 6. Each row holds 6 cells, so the grid is 318 by 210.',
  height: 250,
  build: ({ surface }) => {
    const grid = new Grid({
      columns: 6,
      rows: 4,
      cellSize: 48,
      gap: 6,
      cell: (_column, _row, index) => tile(index),
    });
    surface.root.append(page(grid.node));
  },
});

example({
  part,
  name: 'Cell shapes',
  description:
    'A 3 by 5 grid of cells 96 wide and 32 tall, with a gap of 4. A cell in the middle row is lit by its column and row.',
  height: 220,
  build: ({ surface }) => {
    const grid = new Grid({
      columns: 3,
      rows: 5,
      cellSize: { width: 96, height: 32 },
      gap: 4,
      cell: (_column, _row, index) => tile(index),
    });
    grid.cell(1, 2).style.backgroundColor = '#2f6ea8';
    surface.root.append(page(grid.node));
  },
});

example({
  part,
  name: 'Over an image',
  description:
    'A 5 by 3 grid at 34 px from the top left of a framed panel image. The cells are part filled, so the panel shows through them and in the gaps.',
  height: 280,
  build: ({ surface, images }) => {
    images.add('panel', panel());
    const backing = new Image({
      image: 'panel',
      style: { width: 360, height: 240 },
    });
    const grid = new Grid({
      columns: 5,
      rows: 3,
      cellSize: 52,
      gap: 8,
      style: { position: 'absolute', top: 34, left: 34 },
      cell: (_column, _row, index) =>
        tile(index, {
          backgroundColor: '#0d162088',
          borderColor: '#8fa8c066',
        }),
    });
    backing.node.append(grid.node);
    surface.root.append(page(backing.node));
  },
});

example({
  part,
  name: 'Focus',
  description:
    'Focusable cells. Click the canvas, then move with the arrow keys or the d-pad. Each move lands on the next cell in that direction, with no code in the grid. Enter or A clicks the cell.',
  log: true,
  height: 260,
  build: ({ surface, log }) => {
    surface.input = 'all';
    const grid = new Grid({
      columns: 5,
      rows: 4,
      cellSize: 44,
      gap: 6,
      cell: (column, row, index) => {
        const node = tile(index, { focusable: true });
        node.on('focus', () => {
          node.style.backgroundColor = '#2f6ea8';
          log(`focus ${column},${row}`);
        });
        node.on('blur', () => (node.style.backgroundColor = '#24323f'));
        node.on('click', () => log(`click ${column},${row}`));
        return node;
      },
    });
    surface.root.append(page(grid.node));
  },
});
