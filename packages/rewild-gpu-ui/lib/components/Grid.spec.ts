import { UINode } from '../UINode';
import { Grid, GridOptions } from './Grid';
import { formSetup, PAD } from './testing';

function grid(options: Partial<GridOptions> = {}) {
  return new Grid({
    columns: 6,
    rows: 4,
    cellSize: 40,
    gap: 6,
    cell: () => new UINode({ style: { focusable: true } }),
    ...options,
  });
}

describe('Grid', () => {
  it('builds its cells row by row', () => {
    const calls: number[][] = [];
    const g = grid({
      columns: 3,
      rows: 2,
      cell: (column, row, index) => {
        calls.push([column, row, index]);
        return new UINode({ name: `${index}` });
      },
    });
    expect(calls).toEqual([
      [0, 0, 0],
      [1, 0, 1],
      [2, 0, 2],
      [0, 1, 3],
      [1, 1, 4],
      [2, 1, 5],
    ]);
    expect(g.cells.map((c) => c.name)).toEqual(['0', '1', '2', '3', '4', '5']);
    expect(g.cell(1, 1).name).toBe('4');
    expect(g.node.children).toEqual(g.cells);
  });

  it('takes the node of a component', () => {
    const inner = new UINode();
    const g = grid({ columns: 1, rows: 1, cell: () => ({ node: inner }) });
    expect(g.cells[0]).toBe(inner);
  });

  it('sizes itself from the cells and the gaps', () => {
    const g = grid();
    expect(g.width).toBe(6 * 40 + 5 * 6);
    expect(g.height).toBe(4 * 40 + 3 * 6);
    expect(grid({ gap: 0, cellSize: { width: 80, height: 30 } }).height).toBe(
      120
    );
  });

  it('gives the rectangle of a cell', () => {
    const g = grid();
    expect(g.rect(0, 0)).toEqual({ x: 0, y: 0, width: 40, height: 40 });
    expect(g.rect(2, 1)).toEqual({ x: 92, y: 46, width: 40, height: 40 });
    expect(g.rect(5, 3)).toEqual({ x: 230, y: 138, width: 40, height: 40 });
  });

  it('gives the rectangle of a range of cells, with the gaps inside it', () => {
    const g = grid({ cellSize: { width: 50, height: 30 } });
    expect(g.rect(1, 0, 3, 1)).toEqual({ x: 56, y: 0, width: 162, height: 30 });
    expect(g.rect(0, 1, 1, 3)).toEqual({ x: 0, y: 36, width: 50, height: 102 });
  });

  it('throws for cells outside the grid', () => {
    const g = grid();
    expect(() => g.cell(6, 0)).toThrow(RangeError);
    expect(() => g.cell(0, -1)).toThrow(RangeError);
    expect(() => g.rect(4, 0, 3, 1)).toThrow(RangeError);
    expect(() => g.rect(0, 2, 1, 3)).toThrow(RangeError);
    expect(() => g.rect(0, 0, 0, 1)).toThrow(RangeError);
    expect(() => g.cell(0.5, 0)).toThrow(RangeError);
  });

  it('lays each cell out at its rectangle', () => {
    for (const cellSize of [40, { width: 72, height: 28 }, 10.3]) {
      const g = grid({
        cellSize,
        cell: () =>
          new UINode({ style: { width: 999, flexGrow: 1, flexShrink: 1 } }),
      });
      const { update } = formSetup(g);
      update();
      expect(g.node.rect.width).toBeCloseTo(g.width);
      expect(g.node.rect.height).toBeCloseTo(g.height);
      for (let row = 0; row < g.rows; row++)
        for (let column = 0; column < g.columns; column++) {
          const r = g.rect(column, row);
          const laid = g.cell(column, row).rect;
          expect(laid.x - g.node.rect.x).toBeCloseTo(r.x);
          expect(laid.y - g.node.rect.y).toBeCloseTo(r.y);
          expect(laid.width).toBeCloseTo(r.width);
          expect(laid.height).toBeCloseTo(r.height);
        }
    }
  });

  it('keeps its size in a row that is too narrow', () => {
    const g = grid();
    const { menu, update } = formSetup(g);
    menu.root.style.width = 100;
    update();
    expect(g.node.rect.width).toBe(g.width);
    expect(g.cell(5, 0).rect.y).toBe(g.cell(0, 0).rect.y);
  });

  it('moves focus through the cells with the d-pad', () => {
    const g = grid({ columns: 3, rows: 3 });
    const { pad, update } = formSetup(g);
    update();
    g.cell(0, 0).focus();
    pad(PAD.RIGHT, PAD.RIGHT);
    expect(g.cell(2, 0).focused).toBe(true);
    pad(PAD.DOWN, PAD.DOWN);
    expect(g.cell(2, 2).focused).toBe(true);
    pad(PAD.LEFT);
    expect(g.cell(1, 2).focused).toBe(true);
    pad(PAD.UP);
    expect(g.cell(1, 1).focused).toBe(true);
  });
});
