import { UIStyle } from '../style';
import { Rect, UIChild, UIComponent, UINode } from '../UINode';

export type GridCellSize = number | { width: number; height: number };

/** The grid sets its own size, flex and spacing, so the style leaves them out. */
export type GridStyle = Omit<
  UIStyle,
  | 'width'
  | 'height'
  | 'minWidth'
  | 'maxWidth'
  | 'minHeight'
  | 'maxHeight'
  | 'padding'
  | 'borderWidth'
  | 'flexDirection'
  | 'flexWrap'
  | 'gap'
>;

export interface GridOptions {
  columns: number;
  rows: number;
  /** A number gives square cells. */
  cellSize: GridCellSize;
  /** The space between cells in CSS pixels. Defaults to 0. */
  gap?: number;
  /** Builds the cell at a column and row. `index` counts row by row. */
  cell: (column: number, row: number, index: number) => UIChild;
  /** Names the node in debug output. Defaults to `grid`. */
  name?: string;
  style?: GridStyle;
}

/**
 * Cells of one size in columns and rows, as one flex row that wraps. Each
 * cell gets a fixed width and height, with no grow and no shrink.
 */
export class Grid implements UIComponent {
  readonly node: UINode;
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly gap: number;
  /** The cells, row by row. */
  readonly cells: readonly UINode[];

  constructor(options: GridOptions) {
    const { columns, rows, cellSize } = options;
    this.columns = columns;
    this.rows = rows;
    this.cellWidth = typeof cellSize === 'number' ? cellSize : cellSize.width;
    this.cellHeight = typeof cellSize === 'number' ? cellSize : cellSize.height;
    this.gap = options.gap ?? 0;

    this.node = new UINode({
      name: options.name ?? 'grid',
      style: {
        flexShrink: 0,
        alignItems: 'flex-start',
        ...options.style,
        width: this.width,
        height: this.height,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: this.gap,
      },
    });

    const cells: UINode[] = [];
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        const child = options.cell(column, row, cells.length);
        const node = child instanceof UINode ? child : child.node;
        Object.assign(node.style, {
          width: this.cellWidth,
          height: this.cellHeight,
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: 'auto',
        });
        cells.push(node);
      }
    this.cells = cells;
    this.node.append(...cells);
  }

  /** `columns * cellWidth + (columns - 1) * gap`. */
  get width(): number {
    return this.span(this.columns, this.cellWidth);
  }

  get height(): number {
    return this.span(this.rows, this.cellHeight);
  }

  /** The node in a column and row. Throws outside the grid. */
  cell(column: number, row: number): UINode {
    this.check(column, row, 1, 1);
    return this.cells[row * this.columns + column];
  }

  /**
   * The rectangle of a range of cells, from the grid's top left, with the
   * gaps inside the range. Throws when the range leaves the grid.
   */
  rect(column: number, row: number, columns = 1, rows = 1): Rect {
    this.check(column, row, columns, rows);
    return {
      x: column * (this.cellWidth + this.gap),
      y: row * (this.cellHeight + this.gap),
      width: this.span(columns, this.cellWidth),
      height: this.span(rows, this.cellHeight),
    };
  }

  private span(count: number, size: number): number {
    return count * size + Math.max(0, count - 1) * this.gap;
  }

  private check(column: number, row: number, columns: number, rows: number) {
    if (
      !Number.isInteger(column) ||
      !Number.isInteger(row) ||
      !Number.isInteger(columns) ||
      !Number.isInteger(rows) ||
      column < 0 ||
      row < 0 ||
      columns < 1 ||
      rows < 1 ||
      column + columns > this.columns ||
      row + rows > this.rows
    )
      throw new RangeError(
        `Cells ${column},${row} by ${columns}x${rows} are outside a ${this.columns}x${this.rows} grid`
      );
  }
}
