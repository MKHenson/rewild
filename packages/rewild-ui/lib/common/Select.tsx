import { Icon } from './Icon';
import { Component, register } from '../Component';
import { theme } from '../theme';

type OptionType = { value: string; label: string };

interface Props {
  value?: string;
  options: OptionType[];
  onChange?: (value: string) => void;
}

@register('x-select')
export class Select extends Component<Props> {
  init() {
    const [showDropDown, setShowDropDown] = this.useState(false);

    // Positioned at show time rather than only during render: toggling the
    // dropdown deliberately skips a re-render, so a rect measured in the render
    // pass would be one interaction stale (and zero-sized on the first).
    const positionOptions = () => {
      const rect = this.getBoundingClientRect();
      options.style.top = `${rect.bottom}px`;
      options.style.left = `${rect.left}px`;
      options.style.width = `${rect.width}px`;
    };

    // `parentElement` doubles as "already shown". The list is only ever taken
    // out of the top layer by being removed from the DOM, so connectedness and
    // popover state cannot disagree — which saves probing ':popover-open', a
    // selector older engines throw on.
    //
    // Append before showing: showPopover() requires a connected element.
    const showOptions = () => {
      const alreadyShown = !!options.parentElement;
      if (!alreadyShown) document.body.appendChild(options);
      positionOptions();
      // Drives the open styling (accent border, flipped arrow). Set on the host
      // directly because toggling the dropdown deliberately skips a re-render,
      // so it cannot come from a class in the render function.
      this.classList.add('open');

      if (!alreadyShown && usePopover) {
        try {
          options.showPopover();
        } catch {
          /* Refused for reasons we cannot recover from anyway. The list is in
             the DOM and styled, so it stays usable outside the top layer. */
        }
      }
    };

    const hideOptions = () => {
      this.classList.remove('open');
      if (options.parentElement) document.body.removeChild(options);
    };

    const handleShowOptions = () => {
      setShowDropDown(!showDropDown(), false);

      if (showDropDown()) {
        showOptions();

        setTimeout(
          () => document.body.addEventListener('click', handleElsewhereClicked),
          30
        );
      } else {
        hideOptions();
        cleanup();
      }
    };

    // Create event cleanup function
    const cleanup = () => {
      document.body.removeEventListener('click', handleElsewhereClicked);
    };

    const handleElsewhereClicked = (e: MouseEvent) => {
      cleanup();
      if ((e.target as HTMLElement).classList.contains('option')) return;
      setShowDropDown(false);
    };

    const handleOptionClick = (option: OptionType) => {
      this.props.onChange?.(option.value);
      cleanup();
      setShowDropDown(false);
    };

    let options = (
      <Options>
        {this.props.options.map((option) => (
          <Option
            selected={this.props.value === option.value}
            option={option}
            onclick={() => handleOptionClick(option)}
          />
        ))}
      </Options>
    );

    // Appending the list to document.body escapes any ancestor overflow or
    // stacking context, which is not enough on its own: a Modal is promoted to
    // the browser's top layer (see Popup), and nothing in the normal layer can
    // paint above — or be clicked through — a top-layer element. So the list
    // joins the top layer too. 'manual' rather than 'auto' because an auto
    // popover closes every other open popover that is not its DOM ancestor,
    // which would dismiss the very modal the select sits in.
    const usePopover = typeof options.showPopover === 'function';
    if (usePopover) options.setAttribute('popover', 'manual');

    this.onCleanup = () => {
      hideOptions();
      cleanup();
    };

    return () => {
      if (!showDropDown()) hideOptions();
      else positionOptions();

      return (
        <div class="select" onmouseup={handleShowOptions}>
          <div class="value">
            {
              this.props.options.find((o) => o.value === this.props.value)
                ?.label
            }
          </div>
          <Icon icon="chevron-down" size="s" />
        </div>
      );
    };
  }

  getStyle() {
    return StyledSelect;
  }
}

@register('x-option')
export class Option extends Component<{
  option: OptionType;
  selected?: boolean;
  onclick?: () => void;
}> {
  init() {
    return () => (
      this.classList.toggle('selected', this.props.selected),
      (
        <div class="option" onclick={this.props.onclick}>
          {this.props.option.label}
        </div>
      )
    );
  }

  getStyle() {
    return StyledOption;
  }
}

@register('x-options')
export class Options extends Component {
  init() {
    this.className = 'options';
    return () => <slot />;
  }

  getStyle() {
    return StyledOptions;
  }
}

const StyledOption = cssStylesheet(css`
  /* Padding and size track .select's so each label stays put as the list
     opens over the control. */
  :host {
    display: block;
    padding: 0.6rem;
    font-weight: 400;
    font-size: ${theme.colors.fontSizeMedium};
    background-color: ${theme.colors.surface};
    color: ${theme.colors.onField};
    transition: background-color 0.15s;
  }

  :host(:hover) {
    background-color: ${theme.colors.subtle400};
  }

  :host(.selected) {
    background-color: ${theme.colors.primary400};
    color: ${theme.colors.onPrimary400};
  }

  :host(.selected:hover) {
    background-color: ${theme.colors.primary500};
    color: ${theme.colors.onPrimary500};
  }
`);

const StyledOptions = cssStylesheet(css`
  :host {
    /* Fixed, not absolute: top/left are set from getBoundingClientRect, which
       is viewport-relative — as absolute they would be read against the
       document and the list would slide away from its select on scroll. */
    position: fixed;
    display: block;
    /* Matches the control it drops out of. */
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid ${theme.colors.onSurfaceBorder};
    box-shadow: ${theme.colors.shadowShort2};
    /* A long list scrolls rather than running off the viewport. x stays hidden
       so the first and last options are clipped to the radius. */
    max-height: 16rem;
    overflow-x: hidden;
    overflow-y: auto;
    /* Only relevant on the non-popover fallback path; in the top layer there is
       nothing left to stack against. */
    z-index: 10;
  }

  /* Top-layer popover: the UA centres popovers with inset:0 + margin:auto and
     adds its own box styling, all of which would override the position we set
     inline. Strip it back so this stays an anchored dropdown — but leave
     overflow alone, or the scrolling set above is undone. */
  :host([popover]) {
    inset: auto;
    margin: 0;
    padding: 0;
    background: none;
  }
`);

const StyledSelect = cssStylesheet(css`
  :host {
    position: relative;
    display: block;
    /* Keeps a caption below the field off its border. On the host rather than
       on .select so it stays outside getBoundingClientRect — positionOptions
       anchors the dropdown to rect.bottom, which must be the border edge. */
    margin-bottom: 0.6rem;
  }

  /* Deliberately mirrors Input's box: the two sit next to each other in forms,
     so they share the padding, border, radius and text colour. */
  .select {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    box-sizing: border-box;
    padding: 0.6rem;
    font-size: ${theme.colors.fontSizeMedium};
    background: ${theme.colors.surface};
    color: ${theme.colors.onField};
    border: 1px solid ${theme.colors.onSurfaceBorder};
    border-radius: 4px;
    transition: all 0.25s;
    /* The whole row is a button, so it must not look like selectable text —
       a caret over the arrow reads as "this does nothing". */
    cursor: pointer;
    user-select: none;
  }

  .select:hover {
    border-color: ${theme.colors.onSurfaceLight};
  }

  /* Same treatment Input gives :focus — an open dropdown is the equivalent
     "this control has the interaction" state. */
  :host(.open) .select {
    border-color: ${theme.colors.primary400};
    color: ${theme.colors.primary500};
  }

  .value {
    font-weight: 400;
    /* A label longer than the control must not push the arrow off the row. */
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  x-icon {
    flex-shrink: 0;
    transition: transform 0.25s;
  }

  /* Points at the list while it is open. */
  :host(.open) x-icon {
    transform: rotate(180deg);
  }
`);
