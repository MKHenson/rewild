import { Loading } from './Loading';
import { Icon } from './Icon';
import { Component, register } from '../Component';
import { theme } from '../theme';

export interface TableColumn<T> {
  label: string;
  render: (row: T) => JSX.ChildElement;
  /** Any CSS width, e.g. `120px` or `20%`. Columns without one share the rest. */
  width?: string;
  /** Makes the header a sort control that reports this key. */
  sortKey?: string;
}

export type SortDirection = 'asc' | 'desc';

export interface TableSort {
  key: string;
  direction: SortDirection;
}

/** The sort after a click on `key`'s header: ascending, then descending, then off. */
export function nextSort(current: TableSort | null, key: string): TableSort | null {
  if (current?.key !== key) return { key, direction: 'asc' };
  return current.direction === 'asc' ? { key, direction: 'desc' } : null;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  loading?: boolean;
  emptyMessage?: string;
  /** Makes rows clickable and keyboard-activatable. */
  onRowClick?: (row: T) => void;
  /** Highlights the rows it returns true for. */
  isSelected?: (row: T) => boolean;
  /** The active sort, shown on its column's header. The owner sorts the rows. */
  sort?: TableSort | null;
  /** Called with the next sort when a sortable header is clicked. */
  onSortChange?: (sort: TableSort | null) => void;
}

@register('x-table')
export class Table<T = any> extends Component<TableProps<T>> {
  init() {
    return () => {
      const {
        columns,
        rows,
        loading,
        emptyMessage,
        onRowClick,
        isSelected,
        sort,
        onSortChange,
      } = this.props;
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

          if (isSelected) {
            const selected = isSelected(row);
            tr.classList.toggle('selected', selected);
            tr.setAttribute('aria-selected', String(selected));
          }

          if (onRowClick) {
            tr.classList.add('clickable');
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
              {columns.map((column) => {
                if (!column.sortKey) return <th>{column.label}</th>;

                const key = column.sortKey;
                const direction = sort?.key === key ? sort.direction : null;
                const th = (
                  <th>
                    <button
                      type="button"
                      class={direction ? 'sort active' : 'sort'}
                      onclick={() => onSortChange?.(nextSort(sort ?? null, key))}>
                      <span>{column.label}</span>
                      <Icon
                        icon={direction === 'desc' ? 'chevron-down' : 'chevron-up'}
                        size="xs"
                      />
                    </button>
                  </th>
                ) as HTMLTableCellElement;
                th.setAttribute(
                  'aria-sort',
                  direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'
                );
                return th;
              })}
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
    font-size: 13px;
    font-weight: 500;
    color: ${theme.colors.onSurfaceLight};
    border-bottom: 1px solid ${theme.colors.subtle600};
  }

  /* After MUI's TableSortLabel: the arrow shows faintly on hover and fully on the sorted column. */
  .sort {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    max-width: 100%;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  .sort span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sort x-icon {
    flex: none;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .sort:hover,
  .sort.active {
    color: ${theme.colors.onSurface};
  }

  .sort:hover x-icon {
    opacity: 0.5;
  }

  .sort.active x-icon {
    opacity: 1;
  }

  .sort:focus-visible {
    outline: 2px solid ${theme.colors.primary400};
    outline-offset: 2px;
  }

  th,
  td {
    padding: ${theme.space.s} ${theme.space.m};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  td {
    font-weight: 400;
    color: ${theme.colors.onSurface};
  }

  tbody tr {
    border-bottom: 1px solid ${theme.colors.subtle500};
  }

  tr.clickable {
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  tr.clickable:hover {
    background: color-mix(in srgb, currentColor 6%, transparent);
  }

  tr.selected,
  tr.selected:hover {
    background: color-mix(in srgb, ${theme.colors.primary500} 14%, transparent);
  }

  tr.clickable:focus-visible {
    outline: 2px solid ${theme.colors.primary400};
    outline-offset: -2px;
  }

  tr.message td {
    text-align: center;
    padding: ${theme.space.xxl} ${theme.space.m};
    color: ${theme.colors.onSurfaceLight};
  }
`);
