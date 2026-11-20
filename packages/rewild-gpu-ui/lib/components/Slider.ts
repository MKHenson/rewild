import { UIBoxShadow, UIStyle } from '../style';
import { UIComponent, UINode } from '../UINode';

export interface SliderOptions {
  /** Defaults to `min`. */
  value?: number;
  /** Defaults to 0. */
  min?: number;
  /** Defaults to 100. */
  max?: number;
  /** The value snaps to steps from `min`. 0 does not snap. Defaults to 1. */
  step?: number;
  disabled?: boolean;
  /** Called on each change from a drag, a key or the gamepad. */
  onChange?: (value: number) => void;
  /** Called once when a drag ends, and after each key, with the value. */
  onChangeComplete?: (value: number) => void;
  /** Names the node in debug output. Defaults to `slider`. */
  name?: string;
  style?: UIStyle;
}

/** The thumb's diameter, in CSS pixels. */
const THUMB = 14;
/** The track's height, in CSS pixels. */
const TRACK = 4;

/** `shadowShort1` in style.css, under the thumb. */
const THUMB_SHADOW: UIBoxShadow = { x: 2, y: 2, blur: 4, color: '#00000040' };
/** A soft ring round the thumb on hover. */
const THUMB_HOVER: UIBoxShadow[] = [
  { spread: 5, color: '#0000001a' },
  THUMB_SHADOW,
];

/** The number of decimals in the step, so a snapped value has no float noise. */
function decimalsOf(step: number): number {
  const text = step.toString();
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

/**
 * The DOM's slider: a track filled to the value, and a thumb. A press on the
 * track moves the thumb there, and the drag follows the pointer off the
 * track until it is up.
 *
 * The left and right arrows, and the gamepad's d-pad and stick, step the
 * value. Home and End go to the ends, and Page Up and Page Down take ten
 * steps. Up and down are not steps, as they are in the DOM, so they still
 * move focus between the rows of a form on a gamepad.
 */
export class Slider implements UIComponent {
  readonly node: UINode;
  onChange: ((value: number) => void) | null;
  onChangeComplete: ((value: number) => void) | null;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  private readonly track: UINode;
  private readonly fill: UINode;
  private readonly thumb: UINode;
  private _value: number;
  private _disabled = false;
  private hovered = false;
  /** The pointer that drags the thumb, or null. */
  private dragging: number | null = null;

  constructor(options: SliderOptions = {}) {
    this.min = options.min ?? 0;
    this.max = options.max ?? 100;
    this.step = options.step ?? 1;
    this.onChange = options.onChange ?? null;
    this.onChangeComplete = options.onChangeComplete ?? null;
    this._value = this.clamp(options.value ?? this.min);

    this.fill = new UINode({
      name: 'fill',
      style: {
        position: 'absolute',
        left: 0,
        top: 0,
        height: '100%',
        borderRadius: TRACK / 2,
        backgroundColor: 'primary400',
        pointerEvents: 'none',
      },
    });
    this.thumb = new UINode({
      name: 'thumb',
      style: {
        position: 'absolute',
        top: (TRACK - THUMB) / 2,
        width: THUMB,
        height: THUMB,
        margin: [0, 0, 0, -THUMB / 2],
        borderRadius: THUMB / 2,
        pointerEvents: 'none',
        transition: { property: 'backgroundColor', duration: 150 },
      },
    });
    this.track = new UINode({
      name: 'track',
      style: {
        flexGrow: 1,
        height: TRACK,
        borderRadius: TRACK / 2,
        backgroundColor: 'subtle600',
        pointerEvents: 'none',
      },
    });
    this.track.append(this.fill, this.thumb);
    this.node = new UINode({
      name: options.name ?? 'slider',
      style: {
        alignItems: 'center',
        minWidth: 80,
        height: 20,
        padding: [0, THUMB / 2, 0, THUMB / 2],
        ...options.style,
      },
    });
    this.node.append(this.track);

    this.node.on('pointerenter', () => {
      this.hovered = true;
      this.paint();
    });
    this.node.on('pointerleave', () => {
      this.hovered = false;
      this.paint();
    });
    this.node.on('pointerdown', (e) => {
      if (this._disabled || e.button !== 0 || this.dragging !== null) return;
      this.dragging = e.pointerId;
      this.node.setPointerCapture(e.pointerId);
      this.commit(this.valueAt(e.x));
      this.paint();
    });
    this.node.on('pointermove', (e) => {
      if (e.pointerId === this.dragging) this.commit(this.valueAt(e.x));
    });
    const release = (e: { pointerId: number }) => {
      if (e.pointerId !== this.dragging) return;
      this.dragging = null;
      this.paint();
      this.onChangeComplete?.(this._value);
    };
    this.node.on('pointerup', release);
    this.node.on('pointercancel', release);
    this.node.on('keydown', (e) => {
      if (this._disabled) return;
      const next = this.keyValue(e.key);
      if (next === null) return;
      e.preventDefault();
      this.commit(next);
      this.onChangeComplete?.(this._value);
    });

    this.disabled = options.disabled ?? false;
    this.place();
    this.paint();
  }

  get value(): number {
    return this._value;
  }

  /** Moves the thumb with no `onChange`, for a value set from outside. It clamps to the range. */
  set value(value: number) {
    const next = this.clamp(value);
    if (next === this._value) return;
    this._value = next;
    this.place();
  }

  /** A disabled slider fades, and takes no pointer input and no focus. */
  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    this._disabled = value;
    const style = this.node.style;
    style.opacity = value ? 0.5 : undefined;
    style.pointerEvents = value ? 'none' : undefined;
    style.focusable = !value;
    if (value) {
      this.node.blur();
      this.hovered = false;
      if (this.dragging !== null)
        this.node.releasePointerCapture(this.dragging);
      this.dragging = null;
      this.paint();
    }
  }

  /** The value at a point on the track, in surface CSS pixels, snapped to a step. */
  private valueAt(x: number): number {
    const { x: left, width } = this.track.rect;
    const ratio = width > 0 ? Math.min(1, Math.max(0, (x - left) / width)) : 0;
    return this.snap(this.min + (this.max - this.min) * ratio);
  }

  /** The value a key steps to, or null for a key that is not a step. */
  private keyValue(key: string): number | null {
    const step = this.step > 0 ? this.step : (this.max - this.min) / 100;
    const value = this._value;
    switch (key) {
      case 'ArrowLeft':
        return this.snap(value - step);
      case 'ArrowRight':
        return this.snap(value + step);
      case 'PageDown':
        return this.snap(value - step * 10);
      case 'PageUp':
        return this.snap(value + step * 10);
      case 'Home':
        return this.min;
      case 'End':
        return this.max;
    }
    return null;
  }

  private commit(value: number): void {
    if (value === this._value) return;
    this._value = value;
    this.place();
    this.onChange?.(value);
  }

  private clamp(value: number): number {
    return Math.min(this.max, Math.max(this.min, value));
  }

  private snap(value: number): number {
    const step = this.step;
    if (step <= 0) return this.clamp(value);
    const snapped = this.min + Math.round((value - this.min) / step) * step;
    const factor = 10 ** decimalsOf(step);
    return this.clamp(Math.round(snapped * factor) / factor);
  }

  /** Sizes the fill and moves the thumb to the value. */
  private place(): void {
    const range = this.max - this.min;
    const ratio = range > 0 ? (this._value - this.min) / range : 0;
    const percent = `${ratio * 100}%` as const;
    this.fill.style.width = percent;
    this.thumb.style.left = percent;
  }

  private paint(): void {
    const thumb = this.thumb.style;
    thumb.backgroundColor =
      this.dragging !== null ? 'primary400' : 'background';
    thumb.boxShadow =
      this.hovered || this.dragging !== null ? THUMB_HOVER : THUMB_SHADOW;
  }
}
