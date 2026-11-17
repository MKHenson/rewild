import type { UIFont } from './font';
import type { UIIcons } from './icons';
import { layoutTree } from './layout';
import { PrimitiveStream, writeTree } from './stream';
import { Dirty, UINode } from './UINode';

export interface UISurfaceOptions {
  kind: 'screen';
  name: string;
  /** Surfaces draw from low to high order, then in the order they were made. */
  order?: number;
}

/** Owns one UI tree and says where it draws. */
export class UISurface {
  readonly kind: 'screen';
  readonly name: string;
  readonly order: number;
  readonly root = new UINode();
  readonly stream = new PrimitiveStream();
  width = 0;
  height = 0;
  /** Device pixels per CSS pixel. Text baselines snap to device pixels. */
  pixelRatio = 1;
  needsLayout = true;
  needsPaint = true;
  private overlay = false;
  private _font: UIFont | null = null;
  private _icons: UIIcons | null = null;

  constructor(options: UISurfaceOptions) {
    this.kind = options.kind;
    this.name = options.name;
    this.order = options.order ?? 0;
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

  /** Draws the layout overlay over the tree. */
  get showLayout(): boolean {
    return this.overlay;
  }

  set showLayout(value: boolean) {
    if (value === this.overlay) return;
    this.overlay = value;
    this.needsPaint = true;
  }

  invalidate(flags: Dirty): void {
    if (flags & Dirty.Layout) this.needsLayout = true;
    if (flags & Dirty.Paint) this.needsPaint = true;
  }

  /**
   * Lays out and rebuilds the stream if anything changed. Returns true when
   * the stream changed.
   */
  update(width: number, height: number, pixelRatio = 1): boolean {
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.needsLayout = true;
    }
    if (pixelRatio !== this.pixelRatio) {
      this.pixelRatio = pixelRatio;
      this.needsPaint = true;
    }
    if (!this.needsLayout && !this.needsPaint) return false;
    if (this.needsLayout) layoutTree(this.root, width, height);
    writeTree(this.root, this.stream, {
      overlay: this.overlay,
      font: this._font,
      icons: this._icons,
      pixelRatio,
    });
    clearDirty(this.root);
    this.needsLayout = false;
    this.needsPaint = false;
    return true;
  }
}

function clearDirty(node: UINode): void {
  node.dirty = Dirty.None;
  for (const child of node.children) clearDirty(child);
}
