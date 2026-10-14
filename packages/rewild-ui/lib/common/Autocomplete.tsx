import { Component, register } from '../Component';
import { theme } from '../theme';
import { underlineField } from './fieldStyle';

export interface AutocompleteProps<T> {
  /** Returns the matches for a query. A reply that arrives after a newer query is dropped. */
  search: (query: string) => Promise<T[]>;
  /** The content of one result row. Rows lay their content out in a centred line. */
  renderItem: (item: T) => JSX.ChildElement | JSX.ChildElement[];
  /** Called with the chosen result. The field then clears, ready for the next search. */
  onSelect: (item: T) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Trimmed queries shorter than this do not search. Defaults to 1. */
  minLength?: number;
  /** Milliseconds after the last keystroke before a search starts. Defaults to 250. */
  debounce?: number;
  /** Shown when a search finds nothing. */
  emptyMessage?: string;
}

/** A text field that searches as the user types and offers the results in a list below it. */
@register('x-autocomplete')
export class Autocomplete<T = unknown> extends Component<AutocompleteProps<T>> {
  init() {
    let items: T[] = [];
    let active = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Bumped by every search and close, so a stale reply is recognised and dropped.
    let searchId = 0;

    const input = (
      <input role="combobox" aria-autocomplete="list" aria-expanded="false" />
    ) as HTMLInputElement;
    // Keeps browser autofill and password managers from opening their own lists over ours.
    // Chrome may ignore autocomplete="off" alone, so the field is a search field, which it does not
    // autofill, and its name avoids the words its heuristics match on.
    input.type = 'search';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('name', 'x-autocomplete-query');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('data-lpignore', 'true');
    input.setAttribute('data-1p-ignore', '');
    input.setAttribute('data-form-type', 'other');
    const list = (<div class="list" role="listbox" />) as HTMLDivElement;

    // The list joins the top layer so it can paint over a Modal, like Select's options.
    const usePopover = typeof list.showPopover === 'function';
    if (usePopover) list.setAttribute('popover', 'manual');

    const isOpen = () => list.classList.contains('open');

    const open = () => {
      const rect = input.getBoundingClientRect();
      list.style.top = `${rect.bottom}px`;
      list.style.left = `${rect.left}px`;
      list.style.width = `${rect.width}px`;
      input.setAttribute('aria-expanded', 'true');
      if (isOpen()) return;
      list.classList.add('open');
      if (usePopover && list.isConnected) {
        try {
          list.showPopover();
        } catch {
          /* Already shown, or refused; the list stays usable in place. */
        }
      }
    };

    const close = () => {
      searchId++;
      clearTimeout(timer);
      input.setAttribute('aria-expanded', 'false');
      if (!isOpen()) return;
      list.classList.remove('open');
      if (usePopover) {
        try {
          list.hidePopover();
        } catch {
          /* Not shown as a popover. */
        }
      }
    };

    const showStatus = (message: string) => {
      list.replaceChildren(<div class="status">{message}</div>);
      open();
    };

    const choose = (index: number) => {
      const item = items[index];
      if (item === undefined) return;
      input.value = '';
      close();
      this.props.onSelect(item);
    };

    const paintItems = () => {
      if (!items.length) {
        showStatus(this.props.emptyMessage ?? 'No matches');
        return;
      }

      list.replaceChildren(
        ...items.map((item, i) => {
          const row = (
            <div class={i === active ? 'item active' : 'item'} role="option">
              {this.props.renderItem(item)}
            </div>
          ) as HTMLDivElement;
          row.setAttribute('aria-selected', String(i === active));
          // Keeps focus in the field, so its blur does not close the list before the click lands.
          row.onmousedown = (e) => e.preventDefault();
          row.onclick = () => choose(i);
          return row;
        })
      );
      open();
    };

    const run = async (query: string) => {
      const id = ++searchId;
      showStatus('Searching…');
      try {
        const results = await this.props.search(query);
        if (id !== searchId) return;
        items = results;
        active = results.length ? 0 : -1;
        paintItems();
      } catch (err) {
        if (id !== searchId) return;
        items = [];
        showStatus(err instanceof Error ? err.message : String(err));
      }
    };

    input.oninput = () => {
      const query = input.value.trim();
      close();
      items = [];
      if (query.length < (this.props.minLength ?? 1)) return;
      timer = setTimeout(() => run(query), this.props.debounce ?? 250);
    };

    input.onkeydown = (e) => {
      if (e.key === 'Escape') {
        if (isOpen()) e.stopPropagation();
        close();
      } else if (e.key === 'Enter') {
        if (active < 0) return;
        e.preventDefault();
        choose(active);
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        active = (active + step + items.length) % items.length;
        paintItems();
      }
    };

    input.onblur = close;
    this.onCleanup = close;

    return () => {
      input.placeholder = this.props.placeholder ?? '';
      input.disabled = this.props.disabled === true;
      if (input.disabled) close();
      return [input, list];
    };
  }

  getStyle() {
    return StyledAutocomplete;
  }
}

const StyledAutocomplete = cssStylesheet(css`
  :host {
    display: block;
  }

  input {
    width: 100%;
  }

  ${underlineField('input', 'input:focus', 'input:disabled')}

  input::placeholder {
    color: ${theme.colors.onSurfaceLighter};
    opacity: 1;
  }

  /* A search field only to keep autofill away, so it drops the browser's search styling and clear button. */
  input {
    appearance: none;
    -webkit-appearance: none;
  }

  input::-webkit-search-cancel-button,
  input::-webkit-search-decoration {
    -webkit-appearance: none;
    display: none;
  }

  .list {
    /* Fixed, as top and left come from the viewport-relative field rect. */
    position: fixed;
    display: none;
    box-sizing: border-box;
    max-height: 16rem;
    overflow-x: hidden;
    overflow-y: auto;
    border-radius: 4px;
    border: 1px solid ${theme.colors.onSurfaceBorder};
    box-shadow: ${theme.colors.shadowShort2};
    background-color: ${theme.colors.surface};
    z-index: 10;
  }

  .list.open {
    display: block;
  }

  .list[popover] {
    inset: auto;
    margin: 0;
    padding: 0;
  }

  .item,
  .status {
    display: flex;
    align-items: center;
    gap: ${theme.space.s};
    box-sizing: border-box;
    min-height: ${theme.sizes.control};
    padding: ${theme.space.xs};
    font-family: var(--font-family);
    font-size: ${theme.colors.fontSizeMedium};
    color: ${theme.colors.onField};
  }

  .item {
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .item:hover,
  .item.active {
    background-color: ${theme.colors.subtle400};
  }

  .status {
    color: ${theme.colors.onSurfaceLight};
  }
`);
