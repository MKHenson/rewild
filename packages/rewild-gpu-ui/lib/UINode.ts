import { affectsLayout, Sides, UIStyle } from './style';
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

export interface UINodeOptions {
  style?: UIStyle;
  measure?: MeasureFunction;
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

  constructor(options: UINodeOptions = {}) {
    this.measure = options.measure ?? null;
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

  markDirty(flags: Dirty): void {
    this.dirty |= flags;
    this.surface?.invalidate(flags);
  }

  append(...nodes: UINode[]): void {
    for (const node of nodes) this.insertBefore(node, null);
  }

  /** Inserts before `ref`, or at the end when `ref` is null. Moves a node that is in a tree. */
  insertBefore(node: UINode, ref: UINode | null): void {
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

  replaceChildren(...nodes: UINode[]): void {
    while (this.children.length) this.children[0].remove();
    this.append(...nodes);
  }
}

function styleDirty(key: keyof UIStyle): Dirty {
  return affectsLayout(key) ? Dirty.Layout | Dirty.Paint : Dirty.Paint;
}
