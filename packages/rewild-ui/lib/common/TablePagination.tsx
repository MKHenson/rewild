import { Component, register } from '../Component';
import { theme } from '../theme';
import { Icon } from './Icon';

export interface TablePaginationProps {
  /** Total number of rows. -1 when unknown, which shows "of more than". */
  count: number;
  /** Zero-based. */
  page: number;
  rowsPerPage: number;
  /** Choices for the rows per page select. Fewer than two hides it. */
  rowsPerPageOptions?: number[];
  onPageChange: (page: number) => void;
  /** Called with the new size. The owner is expected to return to the first page, as MUI does. */
  onRowsPerPageChange?: (rowsPerPage: number) => void;
  /** Disables every control, for example while a page loads. */
  disabled?: boolean;
  labelRowsPerPage?: string;
}

const DEFAULT_OPTIONS = [10, 25, 50, 100];

/** Footer controls for a paged table, after MUI's TablePagination: rows per page, the shown range and previous / next. */
@register('x-table-pagination')
export class TablePagination extends Component<TablePaginationProps> {
  init() {
    return () => {
      const {
        count,
        page,
        rowsPerPage,
        rowsPerPageOptions = DEFAULT_OPTIONS,
        onPageChange,
        onRowsPerPageChange,
        disabled = false,
        labelRowsPerPage = 'Rows per page:',
      } = this.props;

      const from = count === 0 ? 0 : page * rowsPerPage + 1;
      const to =
        count === -1
          ? (page + 1) * rowsPerPage
          : Math.min(count, (page + 1) * rowsPerPage);
      const range = `${from}–${to} of ${count === -1 ? `more than ${to}` : count}`;
      const lastPage = count === -1 ? Infinity : Math.max(0, Math.ceil(count / rowsPerPage) - 1);

      const showSize = rowsPerPageOptions.length > 1;
      let size: HTMLSelectElement | null = null;
      if (showSize) {
        size = (
          <select aria-label={labelRowsPerPage}>
            {rowsPerPageOptions.map((option) => (
              <option value={String(option)}>{String(option)}</option>
            ))}
          </select>
        ) as HTMLSelectElement;
        size.value = String(rowsPerPage);
        size.disabled = disabled;
        size.onchange = () => onRowsPerPageChange?.(Number(size!.value));
      }

      const arrow = (
        label: string,
        icon: 'chevron-left' | 'chevron-right',
        target: number,
        enabled: boolean
      ) => {
        const button = (
          <button type="button" class="arrow" aria-label={label} title={label}>
            <Icon icon={icon} size="s" />
          </button>
        ) as HTMLButtonElement;
        button.disabled = disabled || !enabled;
        button.onclick = () => onPageChange(target);
        return button;
      };

      return (
        <div class="pagination">
          {showSize ? (
            <label class="size">
              <span>{labelRowsPerPage}</span>
              <span class="select">
                {size}
                <Icon icon="chevron-down" size="xs" />
              </span>
            </label>
          ) : null}
          <span class="range">{range}</span>
          <span class="arrows">
            {arrow('Go to previous page', 'chevron-left', page - 1, page > 0)}
            {arrow('Go to next page', 'chevron-right', page + 1, page < lastPage)}
          </span>
        </div>
      );
    };
  }

  getStyle() {
    return StyledTablePagination;
  }
}

const StyledTablePagination = cssStylesheet(css`
  :host {
    display: block;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: ${theme.space.xl};
    min-height: 52px;
    padding: 0 ${theme.space.s};
    font-family: var(--font-family);
    font-size: ${theme.colors.fontSizeMedium};
    color: ${theme.colors.onSurface};
  }

  .size {
    display: flex;
    align-items: center;
    gap: ${theme.space.s};
  }

  .select {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  select {
    appearance: none;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    padding: 2px 20px 2px 4px;
    cursor: pointer;
    border-radius: 2px;
  }

  select:focus-visible {
    outline: 2px solid ${theme.colors.primary400};
  }

  .select x-icon {
    position: absolute;
    right: 2px;
    pointer-events: none;
    color: ${theme.colors.onSurfaceLight};
  }

  .arrows {
    display: flex;
    gap: ${theme.space.xs};
  }

  .arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .arrow:hover:not(:disabled) {
    background: color-mix(in srgb, currentColor 8%, transparent);
  }

  .arrow:focus-visible {
    outline: 2px solid ${theme.colors.primary400};
  }

  .arrow:disabled {
    cursor: default;
    color: ${theme.colors.onSurfaceLight};
    opacity: 0.5;
  }
`);
