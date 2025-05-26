import { Component, register } from '../Component';
import { theme } from '../theme';

interface Props {
  value?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
  onChange?: (val: string) => void;
  onClick?: (e: MouseEvent) => void;
}

@register('x-input')
export class Input extends Component<Props> {
  init() {
    const onClick = (e: MouseEvent) => {
      const elm = e.currentTarget as HTMLInputElement;
      elm.focus();
      elm.setSelectionRange(0, elm.value?.length || null);

      if (this.props.onClick) this.props.onClick(e);
    };

    this.onMount = () => {
      if (this.props.autoFocus) {
        const elm = this.shadow!.querySelector('input')!;
        elm.focus();
        elm.setSelectionRange(0, this.props.value?.length || null);
      }
    };

    const elm = (
      <div>
        <input />
      </div>
    );

    return () => {
      elm.className = `input ${this.props.fullWidth ? 'fullwidth' : ''}`;

      const input = elm.children[0] as HTMLInputElement;
      input.className = this.props.className || '';
      input.autofocus = this.props.autoFocus || false;
      input.disabled = this.props.disabled || false;
      input.value = this.props.value?.toString() || '';
      input.onclick = onClick;
      input.onchange = this.props.onChange
        ? (e) => this.props.onChange!(input.value)
        : null;

      return elm;
    };
  }

  getStyle() {
    return StyledInput;
  }
}

const StyledInput = cssStylesheet(css`
  :host > div {
    width: 200px;
  }

  :host > div.fullwidth {
    width: 100%;
  }

  input {
    width: 100%;
    height: 100%;
    padding: 0.6rem;
    outline: none;
    box-sizing: border-box;
    font-family: var(--font-family);
    transition: all 0.25s;
    border: 1px solid transparent;
    border-bottom: 1px solid ${theme.colors.onSurfaceBorder};
    background: ${theme.colors.surface};
    color: ${theme.colors.onSurface};
  }
  input:focus {
    border: 1px solid ${theme.colors.primary400};
    color: ${theme.colors.primary500};
  }
`);
