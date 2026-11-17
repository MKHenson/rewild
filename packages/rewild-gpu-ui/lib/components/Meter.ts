import { packColor, parseColor } from '../color';
import { UIColor, UIStyle } from '../style';
import { UIComponent, UINode } from '../UINode';

export interface MeterOptions {
  /** From 0 to 1. Defaults to 1. */
  value?: number;
  /** The fill when full. The fill turns towards `emptyColor` as it drains. */
  fullColor?: UIColor;
  /** The fill when empty. A darker shade of it is the track. */
  emptyColor?: UIColor;
  style?: UIStyle;
}

/**
 * A bar filled to a value, coloured from full to empty. It pulses more as it
 * drains. It draws with the `meter` effect, which `UIRenderer` registers.
 */
export class Meter implements UIComponent {
  readonly node: UINode;
  private _value = 1;
  private full: number;
  private empty: number;

  constructor(options: MeterOptions = {}) {
    this.node = new UINode({
      effect: 'meter',
      style: { borderWidth: 1, borderColor: '#1a1a1a', ...options.style },
    });
    this.full = packColor(parseColor(options.fullColor ?? '#4dd926'));
    this.empty = packColor(parseColor(options.emptyColor ?? '#ff0000'));
    this.value = options.value ?? 1;
  }

  get value(): number {
    return this._value;
  }

  set value(value: number) {
    this._value = Math.min(1, Math.max(0, value));
    this.write();
  }

  setColors(full: UIColor, empty: UIColor): void {
    this.full = packColor(parseColor(full));
    this.empty = packColor(parseColor(empty));
    this.write();
  }

  private write(): void {
    this.node.setEffectParams(this._value, this.full, this.empty, 0);
  }
}
