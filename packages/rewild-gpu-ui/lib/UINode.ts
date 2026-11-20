import {
  UIEvent,
  UIEventListener,
  UIEventPhase,
  UIEventType,
  UIListenerOptions,
} from './events';
import type { UIIconName } from './iconNames';
import { maxScroll, scrollIntoView, translateChildren } from './scroll';
import type { EffectParams } from './stream';
import { affectsLayout, affectsNoDrawing, Sides, UIStyle } from './style';
import { measureText } from './text';
import {
  findTransition,
  isTransitionProperty,
  NodeTransitions,
} from './transition';
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

interface Listener {
  listener: (event: UIEvent) => void;
  capture: boolean;
}

export interface UINodeOptions {
  /** Names the node in debug output, such as `printTree`. */
  name?: string;
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
  /**
   * Grows the effect's quad by this many CSS pixels on each side, so the
   * effect can draw outside the box, such as a glow. See ui.wgsl.
   */
  effectOutset?: number;
}

/** A 2D box in a UI tree. Later children draw on top of earlier ones. */
export class UINode {
  readonly style: UIStyle;
  readonly children: UINode[] = [];
  parent: UINode | null = null;
  /** Names the node in debug output, such as `printTree`. It has no other use. */
  name: string | null;
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
  /** The running transitions and the values last drawn, or null before the first transition. */
  transitions: NodeTransitions | null = null;
  /**
   * The size of a scroll container's content, from the inside of its
   * border, written by layout. See `overflow: 'scroll'`.
   */
  scrollWidth = 0;
  scrollHeight = 0;
  /**
   * The axes where a scroll container has a scrollbar, so its padding keeps
   * a gutter clear: `y` on the right, `x` at the bottom. Written by layout.
   */
  scrollGutters = { x: false, y: false };
  /** The scrollbar the pointer drags, for the stream to light it, or null. */
  scrollbarDrag: 'x' | 'y' | null = null;
  /** The scrollbar a mouse hovers, for the stream to light it, or null. */
  scrollbarHover: 'x' | 'y' | null = null;
  private _scrollLeft = 0;
  private _scrollTop = 0;
  private _effect: string | null;
  private _effectOutset: number;
  private _text: string | null = null;
  private _icon: UIIconName | null;
  private listeners: Map<UIEventType, Listener[]> | null = null;
  private readonly measureText: MeasureFunction = (limit) =>
    measureText(this, limit);

  constructor(options: UINodeOptions = {}) {
    this.name = options.name ?? null;
    this.measure = options.measure ?? null;
    this._effect = options.effect ?? null;
    this._effectOutset = options.effectOutset ?? 0;
    this._icon = options.icon ?? null;
    if (options.text !== undefined) this.text = options.text;
    this.style = new Proxy<UIStyle>(
      { ...options.style },
      {
        set: (target, key, value) => {
          const name = key as keyof UIStyle;
          if (target[name] === value) return true;
          this.startTransition(target, name);
          (target as Record<string, unknown>)[name] = value;
          this.markDirty(styleDirty(name));
          return true;
        },
        deleteProperty: (target, key) => {
          const name = key as keyof UIStyle;
          if (!(name in target)) return true;
          this.startTransition(target, name);
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
    if (value === null && this.measure === this.measureText)
      this.measure = null;
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

  /** CSS pixels the effect's quad grows by on each side. */
  get effectOutset(): number {
    return this._effectOutset;
  }

  set effectOutset(value: number) {
    if (value === this._effectOutset) return;
    this._effectOutset = value;
    this.markDirty(Dirty.Paint);
  }

  /** How far a scroll container's content is scrolled to the left, in CSS pixels. */
  get scrollLeft(): number {
    return this._scrollLeft;
  }

  set scrollLeft(value: number) {
    this.scrollTo(value, this._scrollTop);
  }

  /** How far a scroll container's content is scrolled up, in CSS pixels. */
  get scrollTop(): number {
    return this._scrollTop;
  }

  set scrollTop(value: number) {
    this.scrollTo(this._scrollLeft, value);
  }

  /**
   * Scrolls the content to an offset, clamped to the size the last layout
   * gave. The children move with no layout, and the surface draws again.
   * Returns true when the content moved.
   */
  scrollTo(left: number, top: number): boolean {
    const max = maxScroll(this);
    const x = Math.min(max.x, Math.max(0, left));
    const y = Math.min(max.y, Math.max(0, top));
    const dx = x - this._scrollLeft;
    const dy = y - this._scrollTop;
    if (dx === 0 && dy === 0) return false;
    this._scrollLeft = x;
    this._scrollTop = y;
    translateChildren(this, -dx, -dy);
    this.markDirty(Dirty.Paint);
    return true;
  }

  scrollBy(dx: number, dy: number): boolean {
    return this.scrollTo(this._scrollLeft + dx, this._scrollTop + dy);
  }

  /**
   * Scrolls the node's scroll containers to show it, after the surface's
   * next layout. A node that takes focus from a key or the gamepad does this.
   */
  scrollIntoView(): void {
    const surface = this.surface;
    if (surface) surface.reveal(this);
    else scrollIntoView(this);
  }

  /**
   * Clamps the scroll to the content size layout gave, and moves the
   * children, which layout placed with no scroll, by it.
   */
  applyScroll(width: number, height: number): void {
    this.scrollWidth = width;
    this.scrollHeight = height;
    const max = maxScroll(this);
    this._scrollLeft = Math.min(max.x, this._scrollLeft);
    this._scrollTop = Math.min(max.y, this._scrollTop);
    if (this._scrollLeft || this._scrollTop)
      translateChildren(this, -this._scrollLeft, -this._scrollTop);
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

  /** Adds a listener. Adding the same listener and phase twice does nothing. */
  on<K extends UIEventType>(
    type: K,
    listener: UIEventListener<K>,
    options: UIListenerOptions = {}
  ): void {
    const capture = options.capture ?? false;
    this.listeners ??= new Map();
    const list = this.listeners.get(type) ?? [];
    if (list.some((l) => l.listener === listener && l.capture === capture))
      return;
    list.push({ listener: listener as Listener['listener'], capture });
    this.listeners.set(type, list);
  }

  off<K extends UIEventType>(
    type: K,
    listener: UIEventListener<K>,
    options: UIListenerOptions = {}
  ): void {
    const list = this.listeners?.get(type);
    if (!list) return;
    const capture = options.capture ?? false;
    const index = list.findIndex(
      (l) => l.listener === listener && l.capture === capture
    );
    if (index !== -1) list.splice(index, 1);
  }

  /**
   * Sends the event down from the root in the capture phase, to this node,
   * then up to the root if it bubbles. The path is fixed when the dispatch
   * starts. Returns false when a listener called `preventDefault`.
   */
  dispatchEvent(event: UIEvent): boolean {
    const path: UINode[] = [];
    for (let node: UINode | null = this; node; node = node.parent)
      path.push(node);
    event.target = this;
    for (let i = path.length - 1; i > 0 && !event.propagationStopped; i--)
      path[i].invoke(event, UIEventPhase.Capture, true);
    // At the target, capture listeners run first, as in the DOM.
    if (!event.propagationStopped)
      this.invoke(event, UIEventPhase.Target, true);
    if (!event.propagationStopped)
      this.invoke(event, UIEventPhase.Target, false);
    if (event.bubbles)
      for (let i = 1; i < path.length && !event.propagationStopped; i++)
        path[i].invoke(event, UIEventPhase.Bubble, false);
    event.currentTarget = null;
    event.eventPhase = UIEventPhase.None;
    return !event.defaultPrevented;
  }

  /**
   * Sends the pointer's moves, its up and its cancel to this node, even off
   * the node, until the pointer is up. Call it from a `pointerdown` listener.
   */
  setPointerCapture(pointerId: number): void {
    const surface = this.surface;
    if (!surface)
      throw new Error('A node must be on a surface to capture the pointer');
    surface.pointerCaptures.set(pointerId, this);
  }

  releasePointerCapture(pointerId: number): void {
    const surface = this.surface;
    if (surface?.pointerCaptures.get(pointerId) === this)
      surface.pointerCaptures.delete(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.surface?.pointerCaptures.get(pointerId) === this;
  }

  /** True when the node has focus on its surface. */
  get focused(): boolean {
    return this.surface?.focused === this;
  }

  /**
   * Takes focus, if the node is focusable, shows and is on a surface.
   * `focusVisible` shows the focus ring, as after a key.
   */
  focus(options: { focusVisible?: boolean } = {}): void {
    this.surface?.setFocus(this, options.focusVisible ?? false);
  }

  blur(): void {
    const surface = this.surface;
    if (surface?.focused === this) surface.setFocus(null);
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

  /** Starts the property's transition, when the style has one for it. */
  private startTransition(style: UIStyle, key: keyof UIStyle): void {
    if (!isTransitionProperty(key)) return;
    const transition = findTransition(style, key);
    if (transition)
      (this.transitions ??= new NodeTransitions()).start(key, transition);
  }

  private invoke(event: UIEvent, phase: UIEventPhase, capture: boolean): void {
    const list = this.listeners?.get(event.type);
    if (!list?.length) return;
    event.currentTarget = this;
    event.eventPhase = phase;
    // A listener can add or remove listeners. Those added wait for the next
    // event, and those removed do not run.
    for (const entry of list.slice())
      if (entry.capture === capture && list.includes(entry))
        entry.listener(event);
  }
}

function styleDirty(key: keyof UIStyle): Dirty {
  if (affectsNoDrawing(key)) return Dirty.None;
  return affectsLayout(key) ? Dirty.Layout | Dirty.Paint : Dirty.Paint;
}
