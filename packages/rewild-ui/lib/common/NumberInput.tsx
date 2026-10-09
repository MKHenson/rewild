import { Component, register } from '../Component';
import { underlineField } from './fieldStyle';

interface Props {
  value?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  min?: number;
  max?: number;
  step?: number;
  precision?: number; // Added precision prop
  className?: string;
  onChange?: (val: number) => void;
  onClick?: (e: MouseEvent) => void;
}

@register('x-number-input')
export class NumberInput extends Component<Props> {
  private isDragging = false;
  private startY = 0;
  private startValue = 0;

  init() {
    const onMouseDown = (e: MouseEvent) => {
      this.isDragging = true;
      this.startY = e.clientY;
      this.startValue = this.props.value || 0;
      // Disable text selection globally
      document.body.style.userSelect = 'none';

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;

      const deltaY = this.startY - e.clientY;
      const step = this.props.step || 1;
      let newValue = this.startValue + deltaY * step;

      if (this.props.min !== undefined)
        newValue = Math.max(newValue, this.props.min);
      if (this.props.max !== undefined)
        newValue = Math.min(newValue, this.props.max);

      // Apply precision if specified
      if (this.props.precision !== undefined) {
        const factor = Math.pow(10, this.props.precision);
        newValue = Math.round(newValue * factor) / factor;
      }

      if (this.props.onChange) this.props.onChange(newValue);
    };

    const onMouseUp = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // Re-enable text selection globally
      document.body.style.userSelect = '';
    };

    this.onMount = () => {
      if (this.props.autoFocus) {
        const elm = this.shadow!.querySelector('input')!;
        elm.focus();
        elm.setSelectionRange(0, this.props.value?.toString().length || null);
      }
    };

    // Reports only a value that differs from the one given, so focusing the
    // field and leaving it unchanged does not count as an edit.
    const onChange = () => {
      const elm = this.shadow!.querySelector('input')!;
      let val = parseFloat((elm as HTMLInputElement).value);
      if (!isNaN(val)) {
        // Apply precision if specified
        if (this.props.precision !== undefined) {
          const factor = Math.pow(10, this.props.precision);
          val = Math.round(val * factor) / factor;
        }
        if (val !== this.props.value) this.props.onChange?.(val);
      }
    };

    const onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onChange();
      }
    };

    const elm = (
      <div>
        <input />
      </div>
    );

    return () => {
      elm.className = `input ${this.props.fullWidth ? 'fullwidth' : ''}`;
      elm.onmousedown = onMouseDown;
      const input = elm.children[0] as HTMLInputElement;
      input.className = this.props.className || '';
      input.autofocus = this.props.autoFocus || false;
      input.disabled = this.props.disabled || false;
      input.value = this.props.value?.toString() || '';
      input.type = 'number';
      input.step = this.props.step?.toString() || '1';
      input.min = this.props.min?.toString() || '';
      input.max = this.props.max?.toString() || '';
      input.onblur = onChange;
      input.onchange = onChange;
      input.onkeydown = onkeydown;

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
    cursor: ns-resize; /* Indicates draggable behavior */
  }

  :host > div.fullwidth {
    width: 100%;
  }

  input {
    width: 100%;
  }

  ${underlineField('input', 'input:focus', 'input:disabled')}
`);
