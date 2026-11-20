import { UIColor, UIStyle } from '../style';
import { UIChild, UIComponent, UINode } from '../UINode';

export type TabsOrientation = 'horizontal' | 'vertical';

export interface TabOptions {
  /** The text on the tab. */
  label: string;
  disabled?: boolean;
  /** The content of the tab's panel. */
  children?: UIChild[];
}

export interface TabsOptions {
  tabs: TabOptions[];
  /** `horizontal` puts the tabs in a row over the panels. Defaults to `horizontal`. */
  orientation?: TabsOrientation;
  /** The index of the open tab. Defaults to 0. */
  active?: number;
  /** Called when a click, a key or the gamepad opens another tab. */
  onChange?: (index: number) => void;
  /** Names the node in debug output. Defaults to `tabs`. */
  name?: string;
  style?: UIStyle;
}

/** The keys that step to the next and the previous tab, for each orientation. */
const STEP_KEYS: Record<TabsOrientation, Record<string, number>> = {
  horizontal: { ArrowRight: 1, ArrowLeft: -1 },
  vertical: { ArrowDown: 1, ArrowUp: -1 },
};

/** The line under the tab that is open, or beside it in a column. */
const INDICATOR = 2;

/** `currentColor` at 8 %, as the DOM's hover, over the tab's text colour. */
const HOVER_FILL: UIColor = { theme: 'onSurface', alpha: 0.08 };
const NO_FILL: UIColor = { theme: 'onSurface', alpha: 0 };
const NO_LINE: UIColor = { theme: 'primary400', alpha: 0 };

/**
 * The DOM's tabs: a row of tabs that picks one panel, or a column beside the
 * panels. The open tab shows a line in `primary400`, and the other panels
 * do not show.
 *
 * Only the open tab takes focus. The arrows along the tabs, and the
 * gamepad's d-pad and stick, open the next tab and move focus to it. They
 * wrap, and skip disabled tabs. Home and End open the first and the last.
 * The arrows across the tabs move focus out of them, into the panel.
 *
 * The panels stay in the tree while they are hidden, so a control keeps its
 * state when another tab opens. A panel scrolls when its content is larger
 * than it.
 */
export class Tabs implements UIComponent {
  readonly node: UINode;
  /** The panel of each tab. Add content to them, or give it in `children`. */
  readonly panels: UINode[];
  onChange: ((index: number) => void) | null;
  private readonly orientation: TabsOrientation;
  private readonly buttons: TabButton[];
  private _active = -1;

  constructor(options: TabsOptions) {
    this.orientation = options.orientation ?? 'horizontal';
    this.onChange = options.onChange ?? null;
    const vertical = this.orientation === 'vertical';

    this.buttons = options.tabs.map(
      (tab, index) =>
        new TabButton(tab, vertical, () => this.select(index, false))
    );
    this.panels = options.tabs.map(
      (tab) =>
        new UINode({
          name: 'panel',
          style: {
            flexDirection: 'column',
            flexGrow: 1,
            flexBasis: 0,
            minWidth: 0,
            minHeight: 0,
            overflow: 'scroll',
          },
        })
    );
    options.tabs.forEach((tab, i) => {
      if (tab.children) this.panels[i].append(...tab.children);
    });

    const list = new UINode({
      name: 'list',
      style: { flexDirection: vertical ? 'column' : 'row', flexShrink: 0 },
    });
    list.append(...this.buttons.map((b) => b.node));
    list.on('keydown', (e) => {
      const current = this._active;
      if (current < 0) return;
      const delta = STEP_KEYS[this.orientation][e.key];
      let next: number;
      if (delta) next = this.stepFrom(current, delta);
      else if (e.key === 'Home')
        next = this.stepFrom(this.buttons.length - 1, 1);
      else if (e.key === 'End') next = this.stepFrom(0, -1);
      else return;
      e.preventDefault();
      this.select(next, true);
    });

    const line = new UINode({
      name: 'line',
      style: {
        flexShrink: 0,
        backgroundColor: 'onSurfaceBorder',
        ...(vertical ? { width: 1 } : { height: 1 }),
      },
    });
    const panels = new UINode({
      name: 'panels',
      style: { flexGrow: 1, flexBasis: 0, minWidth: 0, minHeight: 0 },
    });
    panels.append(...this.panels);

    this.node = new UINode({
      name: options.name ?? 'tabs',
      style: { flexDirection: vertical ? 'row' : 'column', ...options.style },
    });
    this.node.append(list, line, panels);
    this.active = options.active ?? 0;
  }

  /** The index of the open tab, or -1 when there are no tabs. */
  get active(): number {
    return this._active;
  }

  /** Opens a tab with no `onChange`, for a value set from outside. It clamps to the tabs. */
  set active(index: number) {
    const count = this.buttons.length;
    const next = count ? Math.min(Math.max(index, 0), count - 1) : -1;
    if (next === this._active) return;
    this._active = next;
    this.buttons.forEach((button, i) => (button.active = i === next));
    this.panels.forEach(
      (panel, i) => (panel.style.display = i === next ? undefined : 'none')
    );
  }

  /**
   * Opens the tab, gives it focus and calls `onChange`. The focus ring shows
   * when a key opened it.
   */
  private select(index: number, fromKey: boolean): void {
    if (this.buttons[index].disabled) return;
    const changed = index !== this._active;
    this.active = index;
    this.buttons[index].node.focus({ focusVisible: fromKey });
    if (changed) this.onChange?.(index);
  }

  /**
   * The index `delta` steps from `from`, wrapping and skipping disabled tabs.
   * It is `from` when each other tab is disabled.
   */
  private stepFrom(from: number, delta: number): number {
    const count = this.buttons.length;
    for (let i = 1; i <= count; i++) {
      const index = (((from + delta * i) % count) + count) % count;
      if (!this.buttons[index].disabled) return index;
    }
    return from;
  }
}

/** One tab in the list: its label and its line. */
class TabButton implements UIComponent {
  readonly node: UINode;
  readonly disabled: boolean;
  private readonly indicator: UINode;
  private hovered = false;
  private _active = false;

  constructor(tab: TabOptions, vertical: boolean, onClick: () => void) {
    this.disabled = tab.disabled ?? false;
    this.indicator = new UINode({
      name: 'indicator',
      style: {
        position: 'absolute',
        pointerEvents: 'none',
        ...(vertical
          ? { top: 0, bottom: 0, right: 0, width: INDICATOR }
          : { left: 0, right: 0, bottom: 0, height: INDICATOR }),
        transition: { property: 'backgroundColor', duration: 150 },
      },
    });
    const label = new UINode({
      name: 'label',
      text: tab.label,
      style: { whiteSpace: 'nowrap', pointerEvents: 'none' },
    });
    this.node = new UINode({
      name: 'tab',
      style: {
        padding: [12, 16, 12, 16],
        fontSize: 14,
        textAlign: 'left',
        transition: [
          { property: 'color', duration: 150 },
          { property: 'backgroundColor', duration: 150 },
        ],
        ...(this.disabled && { opacity: 0.65, pointerEvents: 'none' }),
      },
    });
    this.node.append(label, this.indicator);

    this.node.on('pointerenter', () => {
      this.hovered = true;
      this.paint();
    });
    this.node.on('pointerleave', () => {
      this.hovered = false;
      this.paint();
    });
    this.node.on('click', () => {
      if (!this.disabled) onClick();
    });
    this.paint();
  }

  set active(value: boolean) {
    this._active = value;
    // Only the open tab takes focus. The arrows move between the tabs.
    this.node.style.focusable = value && !this.disabled;
    if (!value) this.node.blur();
    this.paint();
  }

  private paint(): void {
    const style = this.node.style;
    style.color = this._active
      ? 'primaryText'
      : this.hovered
      ? 'onSurface'
      : 'onSubtle';
    style.backgroundColor = this.hovered ? HOVER_FILL : NO_FILL;
    this.indicator.style.backgroundColor = this._active
      ? 'primary400'
      : NO_LINE;
  }
}
