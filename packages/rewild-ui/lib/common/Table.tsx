import { Loading } from './Loading';
import { Component, register } from '../Component';
import { theme } from '../theme';

export interface TableColumn<T> {
  label: string;
  render: (row: T) => JSX.ChildElement;
  /** Any CSS width, e.g. `120px` or `20%`. Columns without one share the rest. */
  width?: string;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  loading?: boolean;
  emptyMessage?: string;
  /** Makes rows clickable and keyboard-activatable. */
  onRowClick?: (row: T) => void;
}

@register('x-table')
export class Table<T = any> extends Component<TableProps<T>> {
  init() {
    return () => {
      const { columns, rows, loading, emptyMessage, onRowClick } = this.props;
      const span = String(columns.length);

      let body: JSX.ChildElement | JSX.ChildElement[];
      if (loading) {
        body = (
          <tr class="message">
            <td colSpan={span}>
              <Loading />
            </td>
          </tr>
        );
      } else if (rows.length === 0) {
        body = (
          <tr class="message">
            <td colSpan={span}>{emptyMessage || 'Nothing to show'}</td>
          </tr>
        );
      } else {
        body = rows.map((row) => {
          const tr = (
            <tr>
              {columns.map((column) => (
                <td>{column.render(row)}</td>
              ))}
            </tr>
          ) as HTMLTableRowElement;

          if (onRowClick) {
            tr.className = 'clickable';
            tr.tabIndex = 0;
            tr.onclick = () => onRowClick(row);
            tr.onkeydown = (e: KeyboardEvent) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              onRowClick(row);
            };
          }

          return tr;
        });
      }

      return (
        <table>
          <colgroup>
            {columns.map((column) => {
              const col = (<col />) as HTMLTableColElement;
              if (column.width) col.style.width = column.width;
              return col;
            })}
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) => (
                <th>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>{body}</tbody>
        </table>
      );
    };
  }

  getStyle() {
    return StyledTable;
  }
}

const StyledTable = cssStylesheet(css`
  :host {
    display: block;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-family: var(--font-family);
    font-size: ${theme.colors.fontSizeMedium};
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: ${theme.colors.surface};
    text-align: left;
    font-weight: 500;
    color: ${theme.colors.onSubtle};
    border-bottom: 1px solid ${theme.colors.onSurfaceBorder};
  }

  th,
  td {
    padding: 0.6rem 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  tbody tr {
    border-bottom: 1px solid ${theme.colors.onSurfaceBorder};
  }

  tr.clickable {
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  tr.clickable:hover {
    background: color-mix(in srgb, currentColor 6%, transparent);
  }

  tr.clickable:focus-visible {
    outline: 2px solid ${theme.colors.primary400};
    outline-offset: -2px;
  }

  tr.message td {
    text-align: center;
    padding: 2rem 0.75rem;
    color: ${theme.colors.onSurfaceLight};
  }
`);
