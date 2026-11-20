import { UIStyle } from '../style';
import { UIChild, UIComponent, UINode } from '../UINode';
import { Label } from './Label';

export interface FieldOptions {
  label: string;
  /** The control, such as a `Select`, a `Slider` or a `Switch`. */
  control: UIChild;
  /** Help text under the control, in a lighter colour. */
  description?: string;
  /**
   * The width of the label's column, in CSS pixels. The same width on each
   * field of a form lines up the controls. Defaults to 200.
   */
  labelWidth?: number;
  /** Names the node in debug output. Defaults to `field`. */
  name?: string;
  style?: UIStyle;
}

/** The gap between the label's column and the control's. */
const GAP = 16;

/**
 * A row of a form: a label in a column of fixed width, then the control,
 * with an optional description under the control. The label lines up with
 * the middle of a control as tall as a field.
 *
 * The control's column stretches its children, so a `Select` or a `Slider`
 * fills it. A `Switch` keeps its own width.
 */
export class Field implements UIComponent {
  readonly node: UINode;
  private readonly label: Label;
  private readonly description: Label | null;

  constructor(options: FieldOptions) {
    this.label = new Label({
      text: options.label,
      style: { fontSize: 13, fontWeight: 'bold', color: 'onSurfaceLight' },
    });
    const labelColumn = new UINode({
      name: 'label',
      style: {
        flexDirection: 'column',
        justifyContent: 'center',
        width: options.labelWidth ?? 200,
        minHeight: 32,
        flexShrink: 0,
      },
    });
    labelColumn.append(this.label);

    const controlColumn = new UINode({
      name: 'control',
      style: {
        flexDirection: 'column',
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 0,
        gap: 4,
      },
    });
    controlColumn.append(options.control);
    this.description = options.description
      ? new Label({
          name: 'description',
          text: options.description,
          style: { fontSize: 14, color: 'onSurfaceLight' },
        })
      : null;
    if (this.description) controlColumn.append(this.description);

    this.node = new UINode({
      name: options.name ?? 'field',
      style: { alignItems: 'flex-start', gap: GAP, ...options.style },
    });
    this.node.append(labelColumn, controlColumn);
  }

  get text(): string {
    return this.label.text;
  }

  set text(text: string) {
    this.label.text = text;
  }
}
