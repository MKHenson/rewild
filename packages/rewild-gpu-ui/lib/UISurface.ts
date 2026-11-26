import { Matrix4 } from 'rewild-common';
import { UIFocusEvent } from './events';
import { canFocus } from './focus';
import type { UIFont } from './font';
import type { UIIcons } from './icons';
import type { UIImageLookup } from './image';
import { layoutTree } from './layout';
import { scrollIntoView } from './scroll';
import { PrimitiveStream, writeTree } from './stream';
import type { UITheme } from './theme';
import { Dirty, UINode } from './UINode';
import { DEFAULT_PIXELS_PER_METRE, UIWorldSize } from './world';

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

/** The most layouts in one update, when `onLayout` moves nodes. */
const MAX_LAYOUTS = 3;

/**
 * Where a surface draws. A `screen` surface draws over the game, in screen
 * pixels. A `world` surface draws on a quad in the scene, with depth.
 */
export type UISurfaceKind = 'screen' | 'world';

export interface UISurfaceOptions {
  kind: UISurfaceKind;
  name: string;
  /** Surfaces draw from low to high order, then in the order they were made. */
  order?: number;
  /** Defaults to `nodes`. */
  input?: UISurfaceInput;
  /** A world surface's size in metres. Defaults to 1 by 1. */
  size?: UIWorldSize;
  /** A world surface's layout pixels per metre. Defaults to 1,000. */
  pixelsPerMetre?: number;
  /**
   * False draws a world surface over the scene, so walls and terrain do not
   * hide it. Defaults to true.
   */
  depthTest?: boolean;
  /** A world surface's registered surface effect. See `UISurface.effect`. */
  effect?: string | null;
}

/** Owns one UI tree and says where it draws. */
export class UISurface {
  readonly kind: UISurfaceKind;
  readonly name: string;
  readonly order: number;
  /** False draws a world surface over the scene. See `UISurfaceOptions`. */
  readonly depthTest: boolean;
  readonly root = new UINode();
  readonly stream = new PrimitiveStream();
  input: UISurfaceInput;
  /**
   * A world surface's size in metres. It lays out at this size times
   * `pixelsPerMetre`.
   */
  size: UIWorldSize;
  /**
   * A world surface's layout pixels per metre. It sets how big the UI is in
   * the world, not how sharp it is.
   */
  pixelsPerMetre: number;
  /**
   * A world surface's surface effect, which moves and colours the whole
   * surface, or null for none. `hologram` is built in. Register more with
   * `UIEffects.registerSurface`.
   */
  effect: string | null;
  /**
   * The value the surface effect reads, such as its progress. It needs no
   * repaint. Screen surfaces share their uniforms, so it is 1 for them.
   */
  effectValue = 1;
  /**
   * Places a world surface in the world. The local origin is
   * the surface's centre, x points right, y points up and the front faces +z.
   */
  readonly worldMatrix = new Matrix4();
  /** The node that captured each pointer, by pointer id. See `UINode.setPointerCapture`. */
  readonly pointerCaptures = new Map<number, UINode>();
  width = 0;
  height = 0;
  /** Device pixels per CSS pixel. Text baselines snap to device pixels. */
  pixelRatio = 1;
  needsLayout = true;
  needsPaint = true;
  /** Nodes in the tree, counted when the stream was last written. */
  nodeCount = 0;
  /** True when the last update laid out. */
  laidOut = false;
  /** True when the last update wrote the stream. */
  wrote = false;
  /** Milliseconds the last update spent on layout. */
  layoutTime = 0;
  /** Milliseconds the last update spent writing the stream. */
  writeTime = 0;
  /**
   * Called after each layout, before the stream is written. It can place a
   * node from the sizes that layout gave, as a popup does next to its
   * anchor. When it changes a layout property, the surface lays out again,
   * up to a few times in one update.
   */
  onLayout: (() => void) | null = null;
  private overlay = false;
  /** The node to scroll into view after the next layout, or null. */
  private revealing: UINode | null = null;
  private _focused: UINode | null = null;
  private _focusVisible = false;
  private _font: UIFont | null = null;
  private _icons: UIIcons | null = null;
  private _images: UIImageLookup | null = null;
  private _theme: UITheme | null = null;
  private themeRevision = -1;

  constructor(options: UISurfaceOptions) {
    this.kind = options.kind;
    this.name = options.name;
    this.order = options.order ?? 0;
    this.depthTest = options.depthTest ?? true;
    this.effect = options.effect ?? null;
    this.input = options.input ?? 'nodes';
    this.size = { ...(options.size ?? { width: 1, height: 1 }) };
    this.pixelsPerMetre = options.pixelsPerMetre ?? DEFAULT_PIXELS_PER_METRE;
    this.root.owner = this;
  }

  /** A world surface's layout width in CSS pixels. */
  get layoutWidth(): number {
    return this.size.width * this.pixelsPerMetre;
  }

  /** A world surface's layout height in CSS pixels. */
  get layoutHeight(): number {
    return this.size.height * this.pixelsPerMetre;
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

  /**
   * The images that image nodes size from and draw. Images do not draw until
   * it is set. Call `invalidate` when an image loads or goes.
   */
  get images(): UIImageLookup | null {
    return this._images;
  }

  set images(images: UIImageLookup | null) {
    if (images === this._images) return;
    this._images = images;
    this.root.syncImageHolds(images);
    this.needsLayout = true;
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
    // Focus from a key or the gamepad scrolls the node into view.
    if (node && visible) this.reveal(node);
    if (node === old) return true;
    this._focused = node;
    this.needsPaint = true;
    old?.dispatchEvent(new UIFocusEvent('blur', node));
    node?.dispatchEvent(new UIFocusEvent('focus', old));
    return true;
  }

  /**
   * Scrolls the node's scroll containers to show it, in the next update,
   * after layout. See `UINode.scrollIntoView`.
   */
  reveal(node: UINode): void {
    this.revealing = node;
    this.needsPaint = true;
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
    this.laidOut = this.wrote = false;
    this.layoutTime = this.writeTime = 0;
    if (!this.needsLayout && !this.needsPaint) return false;
    let start = performance.now();
    if (this.needsLayout) {
      for (let i = 0; i < MAX_LAYOUTS && this.needsLayout; i++) {
        this.needsLayout = false;
        layoutTree(this.root, width, height, this._images);
        this.onLayout?.();
      }
      const end = performance.now();
      this.laidOut = true;
      this.layoutTime = end - start;
      start = end;
    }
    const revealing = this.revealing;
    this.revealing = null;
    if (revealing?.surface === this) scrollIntoView(revealing);
    const animating = writeTree(this.root, this.stream, {
      overlay: this.overlay,
      font: this._font,
      icons: this._icons,
      images: this._images,
      pixelRatio,
      focus: this.focusVisible ? this._focused : null,
      theme: this._theme,
      now,
    });
    this.nodeCount = clearDirty(this.root);
    this.wrote = true;
    this.writeTime = performance.now() - start;
    this.needsLayout = false;
    this.needsPaint = animating;
    return true;
  }
}

/** Clears the dirty flags of the tree. Returns the number of nodes in it. */
function clearDirty(node: UINode): number {
  node.dirty = Dirty.None;
  let count = 1;
  for (const child of node.children) count += clearDirty(child);
  return count;
}
