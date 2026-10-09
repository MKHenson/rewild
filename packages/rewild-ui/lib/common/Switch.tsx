import { Component, register } from '../Component';
import { theme } from '../theme';

interface Props {
  checked?: boolean;
  disabled?: boolean;
  /** Called on a click, or on Space or Enter while focused. */
  onClick?: (e: Event) => void;
}

@register('x-switch')
export class Switch extends Component<Props> {
  public checked: boolean;

  init() {
    this.checked = this.props.checked || false;

    const elm = (
      <div class="switch">
        <span class="thumb" />
      </div>
    ) as HTMLDivElement;
    elm.setAttribute('role', 'switch');

    const paint = () => {
      const disabled = this.props.disabled === true;
      elm.classList.toggle('checked', this.checked);
      elm.classList.toggle('disabled', disabled);
      elm.setAttribute('aria-checked', String(this.checked));
      elm.setAttribute('aria-disabled', String(disabled));
      elm.tabIndex = disabled ? -1 : 0;
    };

    const toggle = (e: Event) => {
      if (this.props.disabled) return;
      this.checked = !this.checked;
      paint();
      this.props.onClick?.(e);
    };

    elm.onclick = toggle;
    elm.onkeydown = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      toggle(e);
    };

    return () => {
      paint();
      return elm;
    };
  }

  getStyle() {
    return StyledSwitch;
  }
}

const StyledSwitch = cssStylesheet(css`
  /* As tall as a field (underlineField), with its left edge where field text
     starts, so a switch row lines up with the rows around it. */
  :host {
    display: inline-flex;
    align-items: center;
    height: ${theme.sizes.control};
    padding: 0 ${theme.space.xs};
  }

  /* Off is an outlined, empty track; on is a filled one. The state reads from
     the shape as well as the colour. */
  .switch {
    position: relative;
    box-sizing: border-box;
    width: 36px;
    height: 20px;
    border: 1.5px solid ${theme.colors.onSurfaceLight};
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
    outline: none;
    transition: background-color 0.15s, border-color 0.15s;
  }

  .switch:hover {
    border-color: ${theme.colors.onSurface};
  }

  .thumb {
    position: absolute;
    top: 50%;
    left: 3px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: ${theme.colors.onSurfaceLight};
    transform: translateY(-50%);
    transition: left 0.15s, background-color 0.15s;
  }

  .switch:hover .thumb {
    background: ${theme.colors.onSurface};
  }

  .switch.checked {
    background: ${theme.colors.primary400};
    border-color: ${theme.colors.primary400};
  }

  .switch.checked:hover {
    background: ${theme.colors.primary500};
    border-color: ${theme.colors.primary500};
  }

  .switch.checked .thumb,
  .switch.checked:hover .thumb {
    left: 20px;
    background: ${theme.colors.onPrimary400};
  }

  /* Keyboard focus only: the same blue as a focused field. */
  .switch:focus-visible {
    box-shadow: 0 0 0 2px ${theme.colors.surface},
      0 0 0 4px ${theme.colors.primary400};
  }

  .switch.disabled,
  .switch.disabled:hover {
    cursor: default;
    opacity: 0.5;
  }
`);
