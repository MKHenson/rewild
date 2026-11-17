import { UIFocusEvent } from './events';
import { canFocus } from './focus';
import type { UIFont } from './font';
import type { UIIcons } from './icons';
import { layoutTree } from './layout';
import { PrimitiveStream, writeTree } from './stream';
import type { UITheme } from './theme';
import { Dirty, UINode } from './UINode';

/**
 * Which pointer and key input a surface takes from what is under it.
 *
 * - `none`: no input. Its nodes get no events.
 * - `nodes`: pointer input over a node other than the root. The root lets
 *   input through, so the game gets what misses the nodes.
 * - `all`: all pointer and key input while the root shows. A miss goes to
 *   the root. Keys go to the focused node, or else to the root.
 */
export type UISurfaceInput = 'none' | 'nodes' | 'all';

export interface UISurfaceOptions {
  kind: 'screen';
  name: string;
  /** Surfaces draw from low to high order, then in the order they were made. */
  order?: number;
  /** Defaults to `nodes`. */
  input?: UISurfaceInput;
}

/** Owns one UI tree and says where it draws. */
export class UISurface {
  readonly kind: 'screen';
  readonly name: string;
  readonly order: number;
  readonly root = new UINode();
  readonly stream = new PrimitiveStream();
  input: UISurfaceInput;
  /** The node that captured each pointer, by pointer id. See `UINode.setPointerCapture`. */
  readonly pointerCaptures = new Map<number, UINode>();
  width = 0;
  height = 0;
  /** Device pixels per CSS pixel. Text baselines snap to device pixels. */
  pixelRatio = 1;
  needsLayout = true;
  needsPaint = true;
  private overlay = false;
  private _focused: UINode | null = null;
  private _focusVisible = false;
  private _font: UIFont | null = null;
  private _icons: UIIcons | null = null;
  private _theme: UITheme | null = null;
  private themeRevision = -1;

  constructor(options: UISurfaceOptions) {
    this.kind = options.kind;
    this.name = options.name;
    this.order = options.order ?? 0;
    this.input = options.input ?? 'nodes';
    this.root.owner = this;
  }

  /** The font that text measures and draws with. Text has no size until it is set. */
  get font(): UIFont | null {
    return this._font;
  }

  set font(font: UIFont | null) {
    if (font === this._font) return;
    this._font = font;
    this.needsLayout = true;
    this.needsPaint = true;
  }

  /** The icons that icon nodes draw with. Icons do not draw until it is set. */
  get icons(): UIIcons | null {
    return this._icons;
  }

  set icons(icons: UIIcons | null) {
    if (icons === this._icons) return;
    this._icons = icons;
    this.needsPaint = true;
  }

  /** Resolves theme colours. With no theme, they are transparent. */
  get theme(): UITheme | null {
    return this._theme;
  }

  set theme(theme: UITheme | null) {
    if (theme === this._theme) return;
    this._theme = theme;
    this.needsPaint = true;
  }

  /** Draws the layout overlay over the tree. */
  get showLayout(): boolean {
    return this.overlay;
  }

  set showLayout(value: boolean) {
    if (value === this.overlay) return;
    this.overlay = value;
    this.needsPaint = true;
  }

  /**
   * The node with focus, or null. Each surface keeps its own, so focus goes
   * back to a menu when a popup over it closes.
   */
  get focused(): UINode | null {
    const node = this._focused;
    if (node && (node.surface !== this || !canFocus(node))) {
      // The node left the tree, or no longer shows or takes focus.
      this._focused = null;
      this.needsPaint = true;
    }
    return this._focused;
  }

  /** True when the focus ring shows: focus came from a key or the gamepad, not a pointer. */
  get focusVisible(): boolean {
    return this._focusVisible && this.focused !== null;
  }

  /**
   * Moves focus to a focusable node on this surface, or clears it. The node
   * that loses focus gets `blur`, then the node that gets it gets `focus`.
   * Returns false when the node cannot take focus.
   */
  setFocus(node: UINode | null, visible = false): boolean {
    if (node && (node.surface !== this || !canFocus(node))) return false;
    const old = this.focused;
    if (visible !== this._focusVisible) {
      this._focusVisible = visible;
      this.needsPaint = true;
    }
    if (node === old) return true;
    this._focused = node;
    this.needsPaint = true;
    old?.dispatchEvent(new UIFocusEvent('blur', node));
    node?.dispatchEvent(new UIFocusEvent('focus', old));
    return true;
  }

  /** True when the root shows. A surface that is not open takes no input. */
  get open(): boolean {
    return this.root.style.display !== 'none';
  }

  invalidate(flags: Dirty): void {
    if (flags & Dirty.Layout) this.needsLayout = true;
    if (flags & Dirty.Paint) this.needsPaint = true;
  }

  /**
   * Lays out and rebuilds the stream if anything changed. `now` is the time
   * in milliseconds, for transitions. Returns true when the stream changed.
   * While a transition runs, the stream changes on each update.
   */
  update(width: number, height: number, pixelRatio = 1, now = 0): boolean {
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.needsLayout = true;
    }
    if (pixelRatio !== this.pixelRatio) {
      this.pixelRatio = pixelRatio;
      this.needsPaint = true;
    }
    const themeRevision = this._theme?.revision ?? -1;
    if (themeRevision !== this.themeRevision) {
      this.themeRevision = themeRevision;
      this.needsPaint = true;
    }
    if (!this.needsLayout && !this.needsPaint) return false;
    if (this.needsLayout) layoutTree(this.root, width, height);
    const animating = writeTree(this.root, this.stream, {
      overlay: this.overlay,
      font: this._font,
      icons: this._icons,
      pixelRatio,
      focus: this.focusVisible ? this._focused : null,
      theme: this._theme,
      now,
    });
    clearDirty(this.root);
    this.needsLayout = false;
    this.needsPaint = animating;
    return true;
  }
}

function clearDirty(node: UINode): void {
  node.dirty = Dirty.None;
  for (const child of node.children) clearDirty(child);
}
