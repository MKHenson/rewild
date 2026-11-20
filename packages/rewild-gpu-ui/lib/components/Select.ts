import { UIBoxShadow, UIColor, UIStyle } from '../style';
import { UIComponent, UINode } from '../UINode';
import { Icon } from './Icon';
import type { UISurfaceFactory } from './Modal';
import { Popup } from './Popup';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectOptions {
  options: SelectOption[];
  /** The value of the chosen option. With no match, the field is empty. */
  value?: string;
  disabled?: boolean;
  /** Called when a click, Enter or the gamepad's A picks another option. */
  onChange?: (value: string) => void;
  /** Names the node in debug output. Defaults to `select`. */
  name?: string;
  style?: UIStyle;
}

/**
 * The field's bottom line, as an inset shadow so it adds no height: thin at
 * rest, lighter on hover, and a thicker blue while the list is open. These
 * are the DOM's `underlineField`.
 */
const UNDERLINE: Record<'rest' | 'hover' | 'open', UIBoxShadow> = {
  rest: { inset: true, y: -1, color: 'onSurfaceBorder' },
  hover: { inset: true, y: -1, color: 'onSurfaceLight' },
  open: { inset: true, y: -2, color: 'primary400' },
};

/** The height of a field and of each option, `--control-height` in style.css. */
const CONTROL = 32;
/** The list scrolls past this height, the DOM's `16rem`. */
const LIST_HEIGHT = 256;

/**
 * The DOM's dropdown: a field that shows the chosen option, and opens a list
 * of the options on a popup under it. A click, Enter or the gamepad's A
 * opens the list. A list taller than 256 px scrolls.
 *
 * Focus moves to the chosen option in the list. The arrows and the d-pad
 * move between options, and a click, Enter or A picks one and closes the
 * list. A click outside, Escape or B closes it with no change. Focus then
 * goes back to the field.
 */
export class Select implements UIComponent {
  readonly node: UINode;
  /** The list. It opens on its own surface, over the field's. */
  readonly popup: Popup;
  onChange: ((value: string) => void) | null;
  private readonly options: SelectOption[];
  private readonly valueLabel: UINode;
  private readonly items: SelectItem[];
  private _value: string | undefined;
  private _disabled = false;
  private hovered = false;

  constructor(ui: UISurfaceFactory, options: SelectOptions) {
    this.options = options.options;
    this.onChange = options.onChange ?? null;
    this.valueLabel = new UINode({
      name: 'value',
      text: '',
      style: {
        flexGrow: 1,
        minWidth: 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        pointerEvents: 'none',
      },
    });
    const arrow = new Icon({
      icon: 'chevron-down',
      size: 16,
      style: { pointerEvents: 'none' },
    });
    this.node = new UINode({
      name: options.name ?? 'select',
      style: {
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        height: CONTROL,
        padding: [0, 4, 0, 4],
        fontSize: 14,
        color: 'onField',
        backgroundColor: 'fieldFill',
        ...options.style,
      },
    });
    this.node.append(this.valueLabel, arrow);

    this.popup = new Popup(ui, {
      name: 'select',
      offset: 0,
      onClose: () => this.paint(),
      style: { padding: 0, overflow: 'scroll', maxHeight: LIST_HEIGHT },
    });
    this.items = this.options.map(
      (option) => new SelectItem(option.label, () => this.pick(option.value))
    );
    this.popup.append(...this.items);

    this.node.on('pointerenter', () => {
      this.hovered = true;
      this.paint();
    });
    this.node.on('pointerleave', () => {
      this.hovered = false;
      this.paint();
    });
    this.node.on('click', () => this.open());

    this.disabled = options.disabled ?? false;
    this.value = options.value;
    this.paint();
  }

  get value(): string | undefined {
    return this._value;
  }

  /** Chooses an option with no `onChange`, for a value set from outside. */
  set value(value: string | undefined) {
    this._value = value;
    const index = this.options.findIndex((o) => o.value === value);
    this.valueLabel.text = this.options[index]?.label ?? '';
    this.items.forEach((item, i) => (item.selected = i === index));
  }

  /** A disabled select fades, closes its list, and takes no input and no focus. */
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
      this.popup.close();
      this.node.blur();
      this.hovered = false;
      this.paint();
    }
  }

  get isOpen(): boolean {
    return this.popup.isOpen;
  }

  /** Opens the list under the field, as wide as the field, with focus on the chosen option. */
  open(): void {
    if (this._disabled) return;
    this.popup.panel.style.minWidth = this.node.rect.width;
    this.popup.open(this.node);
    const index = this.options.findIndex((o) => o.value === this._value);
    const chosen = this.items[index]?.node;
    if (chosen) {
      chosen.focus({ focusVisible: this.popup.surface.focusVisible });
      chosen.scrollIntoView();
    }
    this.paint();
  }

  /** Closes the list with no change. */
  close(): void {
    this.popup.close();
    this.paint();
  }

  private pick(value: string): void {
    const changed = value !== this._value;
    this.value = value;
    this.close();
    if (changed) this.onChange?.(value);
  }

  private paint(): void {
    this.node.style.boxShadow = this.popup.isOpen
      ? UNDERLINE.open
      : this.hovered
      ? UNDERLINE.hover
      : UNDERLINE.rest;
  }
}

/** One option in the list. The chosen one is filled in `primary400`. */
class SelectItem implements UIComponent {
  readonly node: UINode;
  private hovered = false;
  private _selected = false;

  constructor(label: string, onClick: () => void) {
    this.node = new UINode({
      name: 'option',
      style: {
        alignItems: 'center',
        minHeight: CONTROL,
        padding: [0, 4, 0, 4],
        fontSize: 14,
        focusable: true,
        transition: { property: 'backgroundColor', duration: 150 },
      },
    });
    this.node.append(
      new UINode({ text: label, style: { pointerEvents: 'none' } })
    );
    this.node.on('pointerenter', () => {
      this.hovered = true;
      this.paint();
    });
    this.node.on('pointerleave', () => {
      this.hovered = false;
      this.paint();
    });
    this.node.on('click', onClick);
    this.paint();
  }

  set selected(value: boolean) {
    this._selected = value;
    this.paint();
  }

  private paint(): void {
    const [fill, text]: [UIColor, UIColor] = this._selected
      ? [this.hovered ? 'primary500' : 'primary400', 'onPrimary400']
      : [this.hovered ? 'subtle400' : '#00000000', 'onField'];
    this.node.style.backgroundColor = fill;
    this.node.style.color = text;
  }
}
