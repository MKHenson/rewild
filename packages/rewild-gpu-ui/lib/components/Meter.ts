import { packColor, parseColor } from '../color';
import { HexColor, UIStyle } from '../style';
import { UIComponent, UINode } from '../UINode';

export interface MeterOptions {
  /** From 0 to 1. Defaults to 1. */
  value?: number;
  /** The fill when full. The fill turns towards `emptyColor` as it drains. */
  fullColor?: HexColor;
  /** The fill when empty. A darker shade of it is the track. */
  emptyColor?: HexColor;
  /**
   * Shows what a change lost as a pale band, and what it gained as a bright
   * one, until the fill catches up. Needs `update` each frame.
   */
  trail?: boolean;
  /** Splits the bar into this many parts with thin lines, up to 31. */
  ticks?: number;
  /** Below this value the bar beats and glows, faster as it drains. 0 is never. */
  danger?: number;
  /** Names the node in debug output. Defaults to `meter`. */
  name?: string;
  style?: UIStyle;
}

/** Seconds a trail waits after a change before it catches up. */
export const METER_TRAIL_HOLD = 0.45;
/** A change of at least this much starts the trail's wait again. */
const TRAIL_RESTART = 0.01;
/** How fast the trail closes the gap, per second. */
const TRAIL_RATE = 5;
/** CSS pixels the danger glow reaches past the bar. */
const GLOW_OUTSET = 12;

/**
 * A bar filled to a value, coloured from full to empty, with a gloss and a
 * rounded fill. It can show a trail, ticks and a beat when in danger. It
 * draws with the `meter` effect, which `UIRenderer` registers.
 */
export class Meter implements UIComponent {
  readonly node: UINode;
  private _value = 1;
  private _trail = 1;
  private hold = 0;
  private trails: boolean;
  private ticks: number;
  private danger: number;
  private full: number;
  private empty: number;

  constructor(options: MeterOptions = {}) {
    this.node = new UINode({
      name: options.name ?? 'meter',
      effect: 'meter',
      effectOutset: GLOW_OUTSET,
      style: { borderWidth: 1, borderColor: '#0000004d', ...options.style },
    });
    this.full = packColor(parseColor(options.fullColor ?? '#4dd926'));
    this.empty = packColor(parseColor(options.emptyColor ?? '#ff0000'));
    this.trails = options.trail ?? false;
    this.ticks = Math.min(31, Math.max(0, Math.round(options.ticks ?? 0)));
    this.danger = Math.min(1, Math.max(0, options.danger ?? 0));
    this._value = this._trail = clamp01(options.value ?? 1);
    this.write();
  }

  get value(): number {
    return this._value;
  }

  set value(value: number) {
    const next = clamp01(value);
    if (!this.trails) this._trail = next;
    else if (Math.abs(next - this._value) >= TRAIL_RESTART)
      this.hold = METER_TRAIL_HOLD;
    this._value = next;
    this.write();
  }

  /** Sets the value with no trail, such as on a respawn. */
  snap(value: number): void {
    this._value = this._trail = clamp01(value);
    this.hold = 0;
    this.write();
  }

  /** Where the trail is, from 0 to 1. It equals `value` once it catches up. */
  get trail(): number {
    return this._trail;
  }

  /** Moves the trail towards the value. Call it each frame with the seconds since the last. */
  update(seconds: number): void {
    if (this._trail === this._value) return;
    if (this.hold > 0) {
      this.hold -= seconds;
      return;
    }
    const gap = this._value - this._trail;
    const step = gap * (1 - Math.exp(-seconds * TRAIL_RATE));
    this._trail =
      Math.abs(gap - step) < 0.002 ? this._value : this._trail + step;
    this.write();
  }

  setColors(full: HexColor, empty: HexColor): void {
    this.full = packColor(parseColor(full));
    this.empty = packColor(parseColor(empty));
    this.write();
  }

  private write(): void {
    const extras =
      Math.round(this._trail * 4095) +
      this.ticks * 4096 +
      Math.round(this.danger * 100) * 131072;
    this.node.setEffectParams(this._value, this.full, this.empty, extras);
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
