import type { UIInput } from './UIInput';
import { UIChild, UINode } from './UINode';
import type { UISurface, UISurfaceOptions } from './UISurface';
import type { UITransition } from './style';

/** What a slot gives when nothing is carried: all of its item, or half of a stack. */
export type UITakeAmount = 'all' | 'half';
/** What a slot takes of the carried item: all of it, or one of a stack. */
export type UIPutAmount = 'all' | 'one';

export interface UISlotOptions<T> {
  /** Removes and gives the slot's item, or null when it is empty. */
  take(amount: UITakeAmount): T | null;
  /** Puts the item in. Gives what stays carried, or null. */
  put(item: T, amount: UIPutAmount): T | null;
  /** True when the slot takes the carried item. Defaults to true. */
  accepts?(item: unknown): boolean;
  /** Builds what shows at the pointer while the slot's item is carried. */
  ghost?(item: T): UIChild;
  /** The carry came over the slot, and the slot accepts its item. */
  enter?(): void;
  /** The carry left the slot after `enter`. */
  leave?(): void;
}

export interface UISlot<T = unknown> {
  readonly node: UINode;
  readonly options: UISlotOptions<T>;
  /** The node is no longer a slot. */
  remove(): void;
}

/** What a carry needs from the renderer. */
export interface UICarryHost {
  readonly surfaces: readonly UISurface[];
  createSurface(options: UISurfaceOptions): UISurface;
}

/** CSS pixels the ghost sits up and to the right of a focused node. */
const FOCUS_OFFSET = 12;
const FOCUS_SLIDE: UITransition = { property: 'transform', duration: 80 };

/**
 * Carries one item at most from slot to slot, by pick up and place. A click,
 * a tap, Enter or A on a slot exchanges the carried item and the slot's item:
 * the slot's `take` runs when nothing is carried and its `put` when an item
 * is. The right button, Shift+Enter and X pass `half` and `one`.
 *
 * Escape, B, `cancel`, a press off each surface and the close of the surface
 * of the slot the item came from give the item to `onReturn`.
 */
export class UICarry {
  /** Called after the carried item changes. */
  onChange: ((held: unknown | null) => void) | null = null;
  /**
   * Gives back a carried item, with the slot it came from last. With none,
   * the item goes back through that slot's `put`.
   */
  onReturn: ((item: unknown, from: UISlot) => void) | null = null;
  /** Names an item in debug output. */
  describe: (item: unknown) => string = describeItem;
  /** Draws the ghost over every other screen surface. It takes no input. */
  readonly surface: UISurface;
  private slots = new WeakMap<UINode, UISlot<any>>();
  private _held: unknown | null = null;
  private _from: UISlot<any> | null = null;
  private _over: UISlot<any> | null = null;
  private lit: UISlot<any> | null = null;
  private litItem: unknown | null = null;
  private ghost: UINode | null = null;
  /** The ghost follows the last pointer, or else the focused node. */
  private byPointer = true;
  private pointerX = 0;
  private pointerY = 0;
  private pointerNode: UINode | null = null;

  constructor(private host: UICarryHost, private input: UIInput) {
    this.surface = host.createSurface({
      kind: 'screen',
      name: 'carry',
      order: 3,
      input: 'none',
    });
    this.surface.onLayout = () => this.place();
    input.carry = this;
  }

  /** The carried item, or null. */
  get held(): unknown | null {
    return this._held;
  }

  get carrying(): boolean {
    return this._held !== null;
  }

  /** The slot the carried item came from last, or null. */
  get from(): UISlot | null {
    return this._from;
  }

  /** The slot under the carry, or null. */
  get over(): UISlot | null {
    return this._over;
  }

  /** Makes the node a slot. Its node must be focusable for the keys and the gamepad. */
  slot<T>(child: UIChild, options: UISlotOptions<T>): UISlot<T> {
    const node = child instanceof UINode ? child : child.node;
    const slot: UISlot<T> = {
      node,
      options,
      remove: () => {
        if (this.slots.get(node) === slot) this.slots.delete(node);
      },
    };
    this.slots.set(node, slot);
    return slot;
  }

  /** The slot of the node or of its nearest parent that is a slot, or null. */
  slotOf(node: UINode | null): UISlot | null {
    for (let at = node; at; at = at.parent) {
      const slot = this.slots.get(at);
      if (slot) return slot;
    }
    return null;
  }

  /** Gives the carried item to `onReturn`. */
  cancel(): void {
    const item = this._held;
    const from = this._from;
    if (item === null || !from) return;
    this.setHeld(null, null);
    if (this.onReturn) this.onReturn(item, from);
    else from.options.put(item, 'all');
    this.update();
  }

  /**
   * Acts on the slot of the node, for a click or Enter. `alt` is the right
   * button, Shift+Enter or X. Returns false when the press must go on as a
   * click: the node is in no slot, or nothing is carried and the slot is
   * empty.
   */
  press(node: UINode, alt: boolean): boolean {
    const slot = this.slotOf(node);
    if (!slot) return false;
    const held = this._held;
    if (held === null) {
      const item = slot.options.take(alt ? 'half' : 'all');
      if (item === null) return false;
      this.setHeld(item, slot);
    } else {
      if (!accepts(slot, held)) return true;
      const rest = slot.options.put(held, alt ? 'one' : 'all');
      this.setHeld(rest, rest === null ? null : slot);
    }
    this.update();
    return true;
  }

  /** A screen pointer moved, went down or came up over the node. */
  pointed(x: number, y: number, node: UINode | null): void {
    if (!this.byPointer) {
      this.byPointer = true;
      if (this.ghost) this.ghost.style.transition = undefined;
    }
    this.pointerX = x;
    this.pointerY = y;
    this.pointerNode = node;
    if (this._held !== null) this.update();
  }

  /** A key or the gamepad moved focus or pressed. */
  keyed(): void {
    if (this.byPointer) {
      this.byPointer = false;
      if (this.ghost) this.ghost.style.transition = FOCUS_SLIDE;
    }
    if (this._held !== null) this.update();
  }

  /**
   * Returns the item when the surface of its slot closed, and follows the
   * slot under the carry. Call it once per frame.
   */
  update(): void {
    const from = this._from;
    if (this._held !== null && from && !this.isOpen(from.node)) {
      this.cancel();
      return;
    }
    const held = this._held;
    const target = this.byPointer
      ? this.pointerNode
      : this.input.focusScope()?.focused ?? null;
    const over = held === null ? null : this.slotOf(target);
    this._over = over && this.isOpen(over.node) ? over : null;

    if (this.lit !== this._over || this.litItem !== held) {
      const old = this.lit;
      this.lit = null;
      this.litItem = null;
      old?.options.leave?.();
      const next = this._over;
      if (next && held !== null && accepts(next, held)) {
        this.lit = next;
        this.litItem = held;
        next.options.enter?.();
      }
    }
    const ghost = this.ghost;
    if (ghost) {
      const opacity = this._over && !this.lit ? 0.5 : 1;
      if (ghost.style.opacity !== opacity) ghost.style.opacity = opacity;
      this.place();
    }
  }

  /** Moves the ghost to the pointer, or over the focused node. */
  private place(): void {
    const ghost = this.ghost;
    if (!ghost) return;
    let x = this.pointerX;
    let y = this.pointerY;
    if (!this.byPointer) {
      const focused = this.input.focusScope()?.focused;
      if (!focused) return;
      const r = focused.rect;
      x = r.x + r.width / 2 + FOCUS_OFFSET;
      y = r.y + r.height / 2 - FOCUS_OFFSET;
    }
    x -= ghost.rect.width / 2;
    y -= ghost.rect.height / 2;
    const t = ghost.style.transform;
    if (t?.x !== x || t?.y !== y) ghost.style.transform = { x, y };
  }

  private setHeld(item: unknown | null, from: UISlot<any> | null): void {
    this._held = item;
    this._from = from;
    this.ghost?.remove();
    this.ghost = null;
    if (item !== null && from) {
      const ghost = new UINode({
        name: 'ghost',
        style: {
          position: 'absolute',
          left: 0,
          top: 0,
          pointerEvents: 'none',
          transition: this.byPointer ? undefined : FOCUS_SLIDE,
        },
      });
      const built = from.options.ghost?.(item);
      if (built) ghost.append(built);
      this.ghost = ghost;
      this.surface.root.append(ghost);
    }
    this.onChange?.(item);
  }

  private isOpen(node: UINode): boolean {
    const surface = node.surface;
    return (
      !!surface &&
      surface.open &&
      surface.input !== 'none' &&
      this.host.surfaces.includes(surface)
    );
  }
}

function accepts(slot: UISlot<any>, item: unknown): boolean {
  return slot.options.accepts ? slot.options.accepts(item) : true;
}

function describeItem(item: unknown): string {
  if (typeof item !== 'object' || item === null) return String(item);
  try {
    return JSON.stringify(item);
  } catch {
    return String(item);
  }
}
