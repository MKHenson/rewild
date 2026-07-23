import { MaterialIcon } from './MaterialIcon';
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
          <MaterialIcon icon="arrow_drop_down" size="s" />
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
  :host {
    display: block;
    padding: 0.5rem;
    font-weight: 400;
    background-color: ${theme.colors.surface};
    color: ${theme.colors.onSurface};
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
    border-radius: 5px;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid ${theme.colors.onSurfaceBorder};
    box-shadow: ${theme.colors.shadowShort1};
    /* Only relevant on the non-popover fallback path; in the top layer there is
       nothing left to stack against. */
    z-index: 10;
  }

  /* Top-layer popover: the UA centres popovers with inset:0 + margin:auto and
     adds its own box styling, all of which would override the position we set
     inline. Strip it back so this stays an anchored dropdown. */
  :host([popover]) {
    inset: auto;
    margin: 0;
    padding: 0;
    background: none;
    overflow: hidden;
  }
`);

const StyledSelect = cssStylesheet(css`
  :host {
    position: relative;
    display: block;
  }

  .select {
    display: flex;
    align-items: center;
    justify-content: space-between;
    /* The whole row is a button, so it must not look like selectable text —
       a caret over the arrow reads as "this does nothing". */
    cursor: pointer;
    user-select: none;
  }

  .value {
    padding: 2px;
    font-weight: 400;
  }
`);
