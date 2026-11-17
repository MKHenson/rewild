import type { UIIconName } from './iconNames';
import type { EffectParams } from './stream';
import { affectsLayout, Sides, UIStyle } from './style';
import { measureText } from './text';
import type { UISurface } from './UISurface';

export enum Dirty {
  None = 0,
  Layout = 1,
  Paint = 2,
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Sizes a node's content, such as text. Given a width limit in CSS pixels,
 * which can be `Infinity`, it returns the content size inside the padding.
 */
export type MeasureFunction = (widthLimit: number) => {
  width: number;
  height: number;
};

/** A class that builds a subtree. Its `node` is where it joins a tree. */
export interface UIComponent {
  readonly node: UINode;
}

/** A node, or a component, which the tree methods take as its node. */
export type UIChild = UINode | UIComponent;

function toNode(child: UIChild): UINode {
  return child instanceof UINode ? child : child.node;
}

export interface UINodeOptions {
  style?: UIStyle;
  /**
   * Text drawn in the content box. The text sizes the node, and the node's
   * children are not laid out.
   */
  text?: string;
  measure?: MeasureFunction;
  /**
   * An icon drawn in the content box, as large as fits, in the text colour.
   * It does not size the node.
   */
  icon?: UIIconName;
  /** A registered effect that draws the node's box. See `UIEffects`. */
  effect?: string;
}

/** A 2D box in a UI tree. Later children draw on top of earlier ones. */
export class UINode {
  readonly style: UIStyle;
  readonly children: UINode[] = [];
  parent: UINode | null = null;
  /** The border box in surface CSS pixels, written by layout. */
  rect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  /** Resolved margin and padding in CSS pixels, written by layout. */
  margin: Sides = [0, 0, 0, 0];
  padding: Sides = [0, 0, 0, 0];
  /**
   * Sizes the node from its content instead of its children. Call
   * `markDirty(Dirty.Layout)` when the content changes.
   */
  measure: MeasureFunction | null;
  dirty: Dirty = Dirty.Layout | Dirty.Paint;
  /** Set on the root node of a surface. */
  owner: UISurface | null = null;
  /** The node's index in its surface's primitive stream, written by the stream. */
  primitive = -1;
  readonly effectParams: EffectParams = [0, 0, 0, 0];
  private _effect: string | null;
  private _text: string | null = null;
  private _icon: UIIconName | null;
  private readonly measureText: MeasureFunction = (limit) =>
    measureText(this, limit);

  constructor(options: UINodeOptions = {}) {
    this.measure = options.measure ?? null;
    this._effect = options.effect ?? null;
    this._icon = options.icon ?? null;
    if (options.text !== undefined) this.text = options.text;
    this.style = new Proxy<UIStyle>(
      { ...options.style },
      {
        set: (target, key, value) => {
          const name = key as keyof UIStyle;
          if (target[name] === value) return true;
          (target as Record<string, unknown>)[name] = value;
          this.markDirty(styleDirty(name));
          return true;
        },
        deleteProperty: (target, key) => {
          const name = key as keyof UIStyle;
          if (!(name in target)) return true;
          delete target[name];
          this.markDirty(styleDirty(name));
          return true;
        },
      }
    );
  }

  get surface(): UISurface | null {
    let node: UINode = this;
    while (node.parent) node = node.parent;
    return node.owner;
  }

  /** The node's text, or null. Text sizes the node unless it has its own measure function. */
  get text(): string | null {
    return this._text;
  }

  set text(value: string | null) {
    if (value === this._text) return;
    this._text = value;
    if (value === null && this.measure === this.measureText) this.measure = null;
    else if (value !== null && this.measure === null)
      this.measure = this.measureText;
    this.markDirty(Dirty.Layout | Dirty.Paint);
  }

  /** The icon drawn in the content box, or null. */
  get icon(): UIIconName | null {
    return this._icon;
  }

  set icon(name: UIIconName | null) {
    if (name === this._icon) return;
    this._icon = name;
    this.markDirty(Dirty.Paint);
  }

  /** The registered effect that draws the box in place of its fill, or null. */
  get effect(): string | null {
    return this._effect;
  }

  set effect(name: string | null) {
    if (name === this._effect) return;
    this._effect = name;
    this.markDirty(Dirty.Paint);
  }

  /**
   * Sets the four values the effect reads. Only this node's primitive
   * changes, so the stream is not rebuilt.
   */
  setEffectParams(x: number, y: number, z: number, w: number): void {
    const params = this.effectParams;
    if (
      params[0] === x &&
      params[1] === y &&
      params[2] === z &&
      params[3] === w
    )
      return;
    params[0] = x;
    params[1] = y;
    params[2] = z;
    params[3] = w;
    // A node with no primitive gets its params when the stream is rebuilt.
    this.surface?.stream.setEffectParams(this, params);
  }

  markDirty(flags: Dirty): void {
    this.dirty |= flags;
    this.surface?.invalidate(flags);
  }

  append(...nodes: UIChild[]): void {
    for (const node of nodes) this.insertBefore(node, null);
  }

  /** Inserts before `refChild`, or at the end when it is null. Moves a node that is in a tree. */
  insertBefore(child: UIChild, refChild: UIChild | null): void {
    const node = toNode(child);
    const ref = refChild && toNode(refChild);
    if (ref && ref.parent !== this)
      throw new Error('The reference node is not a child of this node');
    for (let n: UINode | null = this; n; n = n.parent)
      if (n === node) throw new Error('A node cannot contain its ancestor');
    if (node === ref) return;
    node.remove();
    const index = ref ? this.children.indexOf(ref) : this.children.length;
    this.children.splice(index, 0, node);
    node.parent = this;
    node.markDirty(Dirty.Layout | Dirty.Paint);
    this.markDirty(Dirty.Layout);
  }

  remove(): void {
    const parent = this.parent;
    if (!parent) return;
    parent.children.splice(parent.children.indexOf(this), 1);
    this.parent = null;
    parent.markDirty(Dirty.Layout | Dirty.Paint);
  }

  replaceChildren(...nodes: UIChild[]): void {
    while (this.children.length) this.children[0].remove();
    this.append(...nodes);
  }
}

function styleDirty(key: keyof UIStyle): Dirty {
  return affectsLayout(key) ? Dirty.Layout | Dirty.Paint : Dirty.Paint;
}
