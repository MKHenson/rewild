import { Component, register } from '../Component';
import { underlineField } from './fieldStyle';

interface Props {
  value?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
  onChange?: (val: string) => void;
  /** Fires on every keystroke, unlike onChange which waits for commit. */
  onInput?: (val: string) => void;
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
      input.oninput = this.props.onInput
        ? () => this.props.onInput!(input.value)
        : null;

      return elm;
    };
  }

  getStyle() {
    return StyledInput;
  }
}

const StyledInput = cssStylesheet(css`
  :host {
    display: block;
  }

  :host > div {
    width: 200px;
  }

  :host > div.fullwidth {
    width: 100%;
  }

  input {
    width: 100%;
  }

  ${underlineField('input', 'input:focus', 'input:disabled')}

  input[readonly] {
    border-bottom-color: transparent;
    box-shadow: none;
  }
`);
