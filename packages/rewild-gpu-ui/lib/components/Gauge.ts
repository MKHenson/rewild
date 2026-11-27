import { packColor, parseColor } from '../color';
import { HexColor, UIStyle } from '../style';
import { UIComponent, UINode } from '../UINode';

export interface GaugeOptions {
  /** Where the marker is, from 0 at the start to 1 at the end. Defaults to 0.5. */
  value?: number;
  /** The colour at the start. Defaults to a cold blue. */
  startColor?: HexColor;
  /** The colour in the middle. Defaults to a pale white. */
  middleColor?: HexColor;
  /** The colour at the end. Defaults to a hot red. */
  endColor?: HexColor;
  /** Names the node in debug output. Defaults to `gauge`. */
  name?: string;
  style?: UIStyle;
}

/**
 * A scale of colour with a marker at a value, for a reading where both ends
 * are bad, such as temperature. It runs up a box taller than it is wide, else
 * to the right. The end the marker nears glows. It draws with the `gauge`
 * effect, which `UIRenderer` registers.
 */
export class Gauge implements UIComponent {
  readonly node: UINode;
  private _value = 0.5;
  private start: number;
  private middle: number;
  private end: number;

  constructor(options: GaugeOptions = {}) {
    this.node = new UINode({
      name: options.name ?? 'gauge',
      effect: 'gauge',
      style: { borderWidth: 1, borderColor: '#0000004d', ...options.style },
    });
    this.start = packColor(parseColor(options.startColor ?? '#3d7bff'));
    this.middle = packColor(parseColor(options.middleColor ?? '#e6eef5'));
    this.end = packColor(parseColor(options.endColor ?? '#ff3b1f'));
    this.value = options.value ?? 0.5;
  }

  get value(): number {
    return this._value;
  }

  set value(value: number) {
    this._value = Math.min(1, Math.max(0, value));
    this.write();
  }

  setColors(start: HexColor, middle: HexColor, end: HexColor): void {
    this.start = packColor(parseColor(start));
    this.middle = packColor(parseColor(middle));
    this.end = packColor(parseColor(end));
    this.write();
  }

  private write(): void {
    this.node.setEffectParams(this._value, this.start, this.middle, this.end);
  }
}
