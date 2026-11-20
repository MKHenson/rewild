import { UIStyle } from '../style';
import type { UIThemeColor } from '../theme';
import { UIComponent, UINode } from '../UINode';

export interface SwitchOptions {
  checked?: boolean;
  disabled?: boolean;
  /** Called when a click, Enter, Space or the gamepad's A turns the switch. */
  onChange?: (checked: boolean) => void;
  /** Names the node in debug output. Defaults to `switch`. */
  name?: string;
  style?: UIStyle;
}

/** The thumb moves this far, in CSS pixels, when the switch turns on. */
const THUMB_TRAVEL = 17;

/** The track's border and the thumb, off and on, at rest and on hover. */
const COLORS: Record<'off' | 'on', Record<'rest' | 'hover', UIThemeColor>> = {
  off: { rest: 'onSurfaceLight', hover: 'onSurface' },
  on: { rest: 'primary400', hover: 'primary500' },
};

/**
 * The DOM's switch: off is an outlined, empty track, and on is a filled
 * one, so the state reads from the shape as well as the colour. A click,
 * Enter, Space or the gamepad's A turns it.
 *
 * The node is as tall as a field, so a switch in a `Field` lines up with
 * the rows round it.
 */
export class Switch implements UIComponent {
  readonly node: UINode;
  onChange: ((checked: boolean) => void) | null;
  private readonly track: UINode;
  private readonly thumb: UINode;
  private _checked: boolean;
  private _disabled = false;
  private hovered = false;

  constructor(options: SwitchOptions = {}) {
    this._checked = options.checked ?? false;
    this.onChange = options.onChange ?? null;
    this.thumb = new UINode({
      name: 'thumb',
      style: {
        position: 'absolute',
        left: 3,
        top: 3.5,
        width: 10,
        height: 10,
        borderRadius: 5,
        pointerEvents: 'none',
        transition: [
          { property: 'transform', duration: 150 },
          { property: 'backgroundColor', duration: 150 },
        ],
      },
    });
    this.track = new UINode({
      name: 'track',
      style: {
        width: 36,
        height: 20,
        borderWidth: 1.5,
        borderRadius: 10,
        pointerEvents: 'none',
        transition: [
          { property: 'backgroundColor', duration: 150 },
          { property: 'borderColor', duration: 150 },
        ],
      },
    });
    this.track.append(this.thumb);
    this.node = new UINode({
      name: options.name ?? 'switch',
      style: {
        alignItems: 'center',
        alignSelf: 'flex-start',
        height: 32,
        padding: [0, 4, 0, 4],
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
    this.node.on('click', () => this.toggle());
    this.node.on('keydown', (e) => {
      if (e.key !== ' ') return;
      e.preventDefault();
      if (!e.repeat) this.toggle();
    });
    this.disabled = options.disabled ?? false;
    this.paint();
  }

  get checked(): boolean {
    return this._checked;
  }

  /** Turns the switch with no `onChange`, for a value set from outside. */
  set checked(value: boolean) {
    if (value === this._checked) return;
    this._checked = value;
    this.paint();
  }

  /** A disabled switch fades, and takes no pointer input and no focus. */
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
      this.paint();
    }
  }

  private toggle(): void {
    if (this._disabled) return;
    this._checked = !this._checked;
    this.paint();
    this.onChange?.(this._checked);
  }

  private paint(): void {
    const on = this._checked;
    const color = COLORS[on ? 'on' : 'off'][this.hovered ? 'hover' : 'rest'];
    const track = this.track.style;
    track.borderColor = color;
    track.backgroundColor = on ? color : '#00000000';
    const thumb = this.thumb.style;
    thumb.backgroundColor = on ? 'onPrimary400' : color;
    thumb.transform = on ? { x: THUMB_TRAVEL } : undefined;
  }
}
