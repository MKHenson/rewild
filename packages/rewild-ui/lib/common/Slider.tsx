import { Component, register } from '../Component';
import { theme } from '../theme';

interface Props {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  fullWidth?: boolean;
  onChange?: (value: number) => void;
  /** Called once when a drag ends, with the final value. */
  onChangeComplete?: (value: number) => void;
}

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;
const DEFAULT_STEP = 1;

// Number of decimals implied by the step, used to keep snapped values free of
// floating point noise (0.30000000000000004).
function decimalsOf(step: number) {
  const str = step.toString();
  const dot = str.indexOf('.');
  if (dot === -1) return 0;
  return str.length - dot - 1;
}

@register('x-slider')
export class Slider extends Component<Props> {
  private _value = 0;

  /** Assigned by init(): clamps, stores and paints, with no render cycle. */
  private applyValue?: (value: number) => void;

  /** The value currently painted on the track. */
  get value(): number {
    return this._value;
  }

  /**
   * Moves the thumb by writing directly to the existing DOM — no render cycle,
   * and no onChange (that is reserved for user interaction). Values outside
   * min/max are clamped.
   */
  set value(value: number) {
    // Before init() there is nothing to paint, but props feed the first render.
    if (this.applyValue) this.applyValue(value);
    else if (this._props) this._props.value = value;
  }

  init() {
    const min = () => this.props.min ?? DEFAULT_MIN;
    const max = () => this.props.max ?? DEFAULT_MAX;
    const step = () => this.props.step ?? DEFAULT_STEP;

    const clamp = (value: number) => {
      const lo = min();
      const hi = max();
      if (value < lo) return lo;
      if (value > hi) return hi;
      return value;
    };

    const snap = (value: number) => {
      const s = step();
      if (s <= 0) return clamp(value);
      const lo = min();
      const snapped = lo + Math.round((value - lo) / s) * s;
      const factor = Math.pow(10, decimalsOf(s));
      return clamp(Math.round(snapped * factor) / factor);
    };

    const ratioOf = (value: number) => {
      const range = max() - min();
      if (range <= 0) return 0;
      return (clamp(value) - min()) / range;
    };

    // Cached on pointerdown so a drag does not measure the DOM on every move.
    let trackLeft = 0;
    let trackWidth = 0;
    let dragging = false;

    const paint = (value: number) => {
      const pct = ratioOf(value) * 100;
      fill.style.width = `${pct}%`;
      thumb.style.left = `${pct}%`;
      elm.setAttribute('aria-valuenow', value.toString());
    };

    // The single write path for the value: everything below, the public setter
    // and render() all land here. props is kept in step so that a later render
    // does not repaint a value the setter has already superseded.
    this.applyValue = (value: number) => {
      const next = clamp(value);
      this._value = next;
      this.props.value = next;
      paint(next);
    };

    // As above, but for user interaction, which is what onChange reports.
    const commit = (value: number) => {
      if (value === this._value) return;
      this.applyValue!(value);
      this.props.onChange?.(value);
    };

    const valueAt = (clientX: number) => {
      const ratio = trackWidth > 0 ? (clientX - trackLeft) / trackWidth : 0;
      return snap(min() + (max() - min()) * Math.min(1, Math.max(0, ratio)));
    };

    const onPointerDown = (e: PointerEvent) => {
      if (this.props.disabled) return;
      const bounds = track.getBoundingClientRect();
      trackLeft = bounds.left;
      trackWidth = bounds.width;

      dragging = true;
      // Guarded: pointer capture is absent in jsdom.
      elm.setPointerCapture?.(e.pointerId);
      elm.classList.add('dragging');
      elm.focus();
      commit(valueAt(e.clientX));
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      commit(valueAt(e.clientX));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      elm.releasePointerCapture?.(e.pointerId);
      elm.classList.remove('dragging');
      this.props.onChangeComplete?.(this._value);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.props.disabled) return;
      const current = this._value;
      const s = step();
      let next = current;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = current - s;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
        next = current + s;
      else if (e.key === 'Home') next = min();
      else if (e.key === 'End') next = max();
      else if (e.key === 'PageDown') next = current - s * 10;
      else if (e.key === 'PageUp') next = current + s * 10;
      else return;

      e.preventDefault();
      commit(snap(next));
      this.props.onChangeComplete?.(this._value);
    };

    const elm = (
      <div class="slider" role="slider" tabindex="0">
        <div class="track">
          <div class="fill" />
          <div class="thumb" />
        </div>
      </div>
    );

    const track = elm.querySelector('.track') as HTMLDivElement;
    const fill = elm.querySelector('.fill') as HTMLDivElement;
    const thumb = elm.querySelector('.thumb') as HTMLDivElement;

    // Bound here rather than through JSX props: the compiler only assigns a
    // prop when the element already exposes it, and falls back to setAttribute
    // otherwise, which would silently drop these handlers.
    elm.addEventListener('pointerdown', onPointerDown as EventListener);
    elm.addEventListener('pointermove', onPointerMove as EventListener);
    elm.addEventListener('pointerup', onPointerUp as EventListener);
    elm.addEventListener('pointercancel', onPointerUp as EventListener);
    elm.addEventListener('keydown', onKeyDown as EventListener);

    // A slider torn out of the DOM mid-drag never sees its pointerup.
    this.onCleanup = () => {
      dragging = false;
      elm.classList.remove('dragging');
    };

    return () => {
      const disabled = this.props.disabled || false;

      elm.classList.toggle('disabled', disabled);
      this.classList.toggle('fullwidth', this.props.fullWidth || false);
      elm.setAttribute('tabindex', disabled ? '-1' : '0');
      elm.setAttribute('aria-disabled', disabled.toString());
      elm.setAttribute('aria-valuemin', min().toString());
      elm.setAttribute('aria-valuemax', max().toString());

      this.applyValue!(this.props.value ?? min());

      return elm;
    };
  }

  getStyle() {
    return StyledSlider;
  }
}

const StyledSlider = cssStylesheet(css`
  :host {
    display: inline-block;
  }

  :host(.fullwidth) {
    display: block;
    width: 100%;
  }

  .slider {
    box-sizing: border-box;
    position: relative;
    width: 100%;
    min-width: 80px;
    height: 20px;
    padding: 0 7px;
    display: flex;
    align-items: center;
    cursor: pointer;
    outline: none;
    touch-action: none;
  }

  .slider.disabled {
    cursor: default;
    opacity: 0.5;
  }

  .track {
    position: relative;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background-color: ${theme.colors.subtle600};
  }

  .fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    border-radius: 2px;
    background-color: ${theme.colors.primary400};
  }

  .thumb {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    margin-left: -7px;
    margin-top: -7px;
    border-radius: 100%;
    background-color: ${theme.colors.background};
    box-shadow: ${theme.colors.shadowShort1};
    transition: box-shadow 0.2s;
  }

  .slider:not(.disabled):hover .thumb,
  .slider:focus-visible .thumb {
    box-shadow: 0 0 0 5px rgba(0, 0, 0, 0.1), ${theme.colors.shadowShort1};
  }

  .slider.dragging .thumb {
    background-color: ${theme.colors.primary400};
  }
`);
