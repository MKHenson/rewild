import {
  UIEvent,
  UIKeyboardEvent,
  UIKeyboardInit,
  UIPointerEvent,
  UIPointerInit,
  UIPointerType,
  UIWheelEvent,
  UIWheelInit,
} from './events';
import {
  FocusDirection,
  focusableAncestor,
  focusableNodes,
  nearestInDirection,
  nextInTabOrder,
} from './focus';
import { GamepadReader } from './gamepad';
import { hitTest, insideRounded } from './hitTest';
import { innerBox } from './layout';
import {
  firstScroller,
  isScrollContainer,
  maxScroll,
  Scrollbar,
  scrollbars,
  scrollerFor,
  scrollForThumb,
} from './scroll';
import { Dirty, Rect, UINode } from './UINode';
import type { UISurface } from './UISurface';
import type { UICarry } from './UICarry';
import { rayToSurface, UIVector3 } from './world';

/**
 * What became of an input. `taken` means a surface took it, so the game must
 * not get it. `prevented` means it was taken and a listener called
 * `preventDefault`.
 */
export type UIInputResult = 'passed' | 'taken' | 'prevented';

export type UIPointerAction = 'down' | 'move' | 'up' | 'cancel';

/** The surfaces input goes to, from bottom to top. */
export interface UISurfaceList {
  readonly surfaces: readonly UISurface[];
}

/** One input of a pointer that points with a ray in the world. */
export interface UIRayInit {
  pointerId: number;
  /** Where the ray starts, in world space. */
  origin: UIVector3;
  /** The ray's direction, in world space, with a length of 1. */
  direction: UIVector3;
  /**
   * Metres along the ray. A world surface farther than this misses. When the
   * scene has something nearer along the ray, pass its distance, so the scene
   * blocks the ray.
   */
  reach: number;
  /** The button that changed, as in the DOM: 0 is the main button. */
  button?: number;
  /** The buttons that are down, as a DOM bit mask. */
  buttons?: number;
}

/** A pointer the input knows, and the node under it. */
export interface UIPointerHit {
  pointerId: number;
  pointerType: UIPointerType;
  /** The last position, in surface CSS pixels. */
  x: number;
  y: number;
  /** The node the pointer hovers, or null. */
  node: UINode | null;
  /** True when the game took the press, so the UI ignores the pointer until it is up. */
  game: boolean;
}

/** The node that takes a point, for one pointer. */
type Pick = (x: number, y: number) => UINode | null;

interface PointerState {
  type: UIPointerType;
  /** Finds the node under the pointer: on the screen, or on the surface its ray meets. */
  pick: Pick;
  /** The last input of the pointer, for the leave events when it goes. */
  last: UIPointerInit;
  /** The hovered node and its ancestors, the node first. */
  hover: UINode[];
  /** The node the press went down on, for `click`. */
  down: UINode | null;
  /** A surface took the press, so all the pointer's input is taken until it is up. */
  taken: boolean;
  /** The game took the press, so the UI ignores the pointer until it is up. */
  game: boolean;
  /** Where a touch went down, and the scroll container it can drag, until it drags or lifts. */
  pan: { node: UINode; x: number; y: number } | null;
  /** True once a touch drags its scroll container. It sends no more events. */
  panning: boolean;
  /** The scrollbar the pointer drags, and where on the thumb it holds it. */
  bar: { node: UINode; vertical: boolean; grab: number } | null;
  /** The scroll container whose scrollbar a mouse hovers, or null. */
  barHover: UINode | null;
}

type PointerEventType =
  | 'pointerdown'
  | 'pointermove'
  | 'pointerup'
  | 'pointercancel';

const POINTER_ACTIONS: Record<PointerEventType, UIPointerAction> = {
  pointerdown: 'down',
  pointermove: 'move',
  pointerup: 'up',
  pointercancel: 'cancel',
};

const POINTER_EVENTS = Object.keys(POINTER_ACTIONS) as PointerEventType[];

/** The DOM mouse events that follow a pointer event. A press takes or passes them all. */
const MOUSE_EVENTS = [
  'mousedown',
  'mousemove',
  'mouseup',
  'click',
  'dblclick',
  'contextmenu',
] as const;

/** The DOM gives the mouse this pointer id. A wheel event has no pointer id. */
const MOUSE_POINTER_ID = 1;
/** CSS pixels for a wheel delta in lines. */
const LINE_HEIGHT = 16;
/** The pointer id of a click from a key or a gamepad. */
const KEY_POINTER_ID = -1;
/** CSS pixels a touch moves before it drags its scroll container in place of its node. */
const PAN_SLOP = 8;
/** CSS pixels round a scrollbar that a press still takes, as the bar is thin. */
const SCROLLBAR_GRAB = 3;
/** CSS pixels per second that the right stick scrolls at full tilt. */
const STICK_SCROLL_SPEED = 1200;
/** The longest frame the right stick scrolls for, in milliseconds, so a stall does not jump. */
const STICK_MAX_FRAME = 50;

const ARROWS: Record<string, FocusDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export interface UIInputAttachOptions {
  /**
   * Also takes keys while the page has focus, not only while the element has
   * it. The game's canvas does not take focus, so it needs this. Defaults to
   * true.
   */
  pageKeys?: boolean;
}

/**
 * Turns pointer and key input into UI events on the surfaces' trees.
 *
 * Sources call `pointer`, `wheel` and `key` with points in surface CSS
 * pixels. `attach` makes the mouse, touch and keys of an element such as the
 * game's canvas a source. When a surface takes a DOM event, the
 * event stops at the window, so no listener of the game gets it.
 *
 * Focus lives on the topmost open surface that takes all input, the focus
 * scope. Keys go to its focused node, or else to its root. When no listener
 * prevents the default, Tab and Shift+Tab move focus in tree order, the
 * arrow keys move it to the nearest node in that direction, and Enter clicks
 * the focused node.
 *
 * Scrolling is the default action of a wheel: the nearest scroll container
 * that can move scrolls. A touch that drags past a few pixels scrolls its
 * container in place of its node, and a press on a scrollbar drags it.
 *
 * A gamepad acts as these keys: see `GamepadReader`. Its right stick scrolls. The input does not read
 * the pads itself. Their owner reads them once per frame and gives them to
 * `readGamepads` while the UI has the pad, so the UI and the game never both
 * act on one press.
 */
export class UIInput {
  /** Called after each event the input sends. */
  onDispatch: ((event: UIEvent) => void) | null = null;
  /**
   * Called when the input changes what the UI draws but sends no event: a
   * scrollbar drag, hover or page, and a touch pan. An owner that draws only
   * on input draws again here.
   */
  onRedraw: (() => void) | null = null;
  /**
   * Picks up and places items in slots. A click or Enter on a slot goes to it
   * in place of a click, and Escape returns its item before the nodes get it.
   */
  carry: UICarry | null = null;
  private pointers = new Map<number, PointerState>();
  private element: HTMLElement | null = null;
  private touchAction = '';
  /** Whether the last DOM pointer down and pointer move were taken, for the mouse events after them. */
  private pressTaken = false;
  private moveTaken = false;
  private pageKeys = true;
  private gamepads = new GamepadReader();
  /** The time of the last gamepad read, for the right stick's scroll. */
  private lastPadTime: number | null = null;

  constructor(private source: UISurfaceList) {}

  /**
   * Sends one pointer input. The target is the node that captured the
   * pointer, or else the topmost node under it. A down that no surface takes
   * belongs to the game, and the UI ignores the pointer until it is up.
   */
  pointer(action: UIPointerAction, init: UIPointerInit): UIInputResult {
    return this.sendPointer(action, init, this.pickScreen);
  }

  /**
   * Sends one input of a ray pointer. The ray meets the front of the nearest
   * open world surface that takes input, within reach. Its point on that
   * surface then acts as a screen point does in `pointer`. A pointer that a
   * node captured stays on the plane of that node's surface, even off its
   * edge. A ray from behind a surface does not reach its nodes.
   */
  ray(action: UIPointerAction, init: UIRayInit): UIInputResult {
    const id = init.pointerId;
    const state = this.pointers.get(id);
    if (action === 'cancel')
      return state ? this.cancel(state, state.last) : 'passed';
    const captured = this.captured(id)?.surface;
    const hit = captured
      ? surfaceHit(captured, init)
      : this.castRay(init.origin, init.direction, init.reach);
    const surface = hit?.surface ?? null;
    return this.sendPointer(
      action,
      {
        pointerId: id,
        pointerType: 'ray',
        x: hit?.x ?? state?.last.x ?? 0,
        y: hit?.y ?? state?.last.y ?? 0,
        button: init.button ?? 0,
        buttons: init.buttons ?? 0,
      },
      surface ? (x, y) => pickOn(surface, x, y) : () => null
    );
  }

  /** The node the pointer hovers, or null. */
  pointerTarget(pointerId: number): UINode | null {
    return this.pointers.get(pointerId)?.hover[0] ?? null;
  }

  private sendPointer(
    action: UIPointerAction,
    init: UIPointerInit,
    pick: Pick
  ): UIInputResult {
    const id = init.pointerId;
    let state = this.pointers.get(id);
    if (!state) {
      state = {
        type: init.pointerType,
        pick,
        last: init,
        hover: [],
        down: null,
        taken: false,
        game: false,
        pan: null,
        panning: false,
        bar: null,
        barHover: null,
      };
      this.pointers.set(id, state);
    }
    state.last = init;
    state.pick = pick;
    if (state.game) {
      if (action === 'up' || action === 'cancel') this.pointers.delete(id);
      return 'passed';
    }
    if (action === 'cancel') return this.cancel(state, init);
    if (state.bar || state.panning) return this.drag(state, action, init);

    const target = this.captured(id) ?? pick(init.x, init.y);
    this.hover(state, target, init);
    if (pick === this.pickScreen) this.carry?.pointed(init.x, init.y, target);

    if (action === 'down') {
      if (!target && this.carry?.carrying) {
        // A press off each surface returns the carried item.
        this.carry.cancel();
        state.taken = true;
        return 'prevented';
      }
      if (!target) {
        state.game = true;
        return 'passed';
      }
      state.taken = true;
      // A press on a scrollbar drags it, and sends no events.
      if (this.pressScrollbar(state, target, init)) return 'prevented';
      state.down = target;
      if (state.type === 'touch') {
        const node = scrollerFor(target, 1, 1) ?? scrollerFor(target, -1, -1);
        state.pan = node && { node, x: init.x, y: init.y };
      }
      const result = this.send(target, new UIPointerEvent('pointerdown', init));
      // A press focuses its nearest focusable node, as in the DOM, unless a
      // listener prevents it.
      if (result !== 'prevented') this.focusFromPointer(target);
      return result;
    }

    if (action === 'move') {
      if (this.startPan(state, init)) return 'prevented';
      const result = target
        ? this.send(target, new UIPointerEvent('pointermove', init))
        : 'passed';
      return result === 'passed' && state.taken ? 'taken' : result;
    }

    let result: UIInputResult = target
      ? this.send(target, new UIPointerEvent('pointerup', init))
      : 'passed';
    if (result === 'passed' && state.taken) result = 'taken';
    // A click goes to the nearest node that holds both the down and the up,
    // as in the DOM. Only the main button clicks. A slot takes the main and
    // the right button in place of a click.
    const at = target && state.down && commonAncestor(state.down, target);
    const button = init.button ?? 0;
    const carried =
      at &&
      (button === 0 || button === 2) &&
      this.carry?.press(at, button === 2);
    if (at && button === 0 && !carried)
      this.send(at, new UIPointerEvent('click', init));
    this.releaseCapture(id);
    state.down = null;
    state.taken = false;
    state.pan = null;
    if (pointsBetweenPresses(state.type)) {
      this.hover(state, pick(init.x, init.y), init);
    } else {
      // A touch is gone when it lifts.
      this.hover(state, null, init);
      this.pointers.delete(id);
    }
    return result;
  }

  /**
   * Sends a wheel to the node under the pointer. Then, unless a listener
   * prevents it, the nearest scroll container that can move scrolls by the
   * delta. Shift turns a vertical wheel into a horizontal one.
   */
  wheel(init: UIWheelInit): UIInputResult {
    const target = this.captured(init.pointerId) ?? this.pick(init.x, init.y);
    if (!target) return 'passed';
    const result = this.send(target, new UIWheelEvent(init));
    if (result === 'prevented') return result;
    let { deltaX: dx, deltaY: dy } = init;
    if (init.shiftKey && dx === 0) [dx, dy] = [dy, 0];
    if (scrollerFor(target, dx, dy)?.scrollBy(dx, dy)) return 'prevented';
    // A scroll container at its end keeps the wheel, so the page does not
    // scroll, as with CSS `overscroll-behavior: contain`. A browser gives a
    // whole trackpad gesture to the page when its first event is not
    // prevented, so this also holds a gesture that starts at an end.
    return insideScroller(target) ? 'prevented' : result;
  }

  /**
   * Sends a key to the focused node of the focus scope, or else to its root.
   * Then, unless a listener prevents it, a key down does its default action.
   */
  key(action: 'down' | 'up', init: UIKeyboardInit): UIInputResult {
    if (action === 'down' && init.key === 'Escape' && this.carry?.carrying) {
      this.carry.cancel();
      return 'prevented';
    }
    const scope = this.focusScope();
    if (!scope) return 'passed';
    const target = scope.focused ?? scope.root;
    const type = action === 'down' ? 'keydown' : 'keyup';
    const result = this.send(target, new UIKeyboardEvent(type, init));
    if (result === 'prevented' || action === 'up') return result;
    // A listener can close the scope, as Escape closes a menu.
    if (this.focusScope() !== scope) return result;
    return this.keyAction(scope, init) ? 'prevented' : result;
  }

  /**
   * The topmost open screen surface that takes all input, where focus lives.
   * World surfaces are not focus scopes.
   */
  focusScope(): UISurface | null {
    const surfaces = this.source.surfaces;
    for (let i = surfaces.length - 1; i >= 0; i--) {
      const surface = surfaces[i];
      if (surface.kind !== 'screen') continue;
      if (surface.input === 'all' && surface.open) return surface;
    }
    return null;
  }

  /** The pointers the input knows, each with the node under it. */
  pointerHits(): UIPointerHit[] {
    const hits: UIPointerHit[] = [];
    for (const [pointerId, state] of this.pointers)
      hits.push({
        pointerId,
        pointerType: state.type,
        x: state.last.x,
        y: state.last.y,
        node: state.hover[0] ?? null,
        game: state.game,
      });
    return hits;
  }

  /**
   * Reads the gamepads once, as keys. Call it once per frame while the UI
   * has the pad. The right stick scrolls: see `stickScroll`.
   */
  readGamepads(pads: readonly (Gamepad | null)[], now: number): void {
    this.gamepads.update(pads, now, (action, init) => this.key(action, init));
    const frame = Math.min(STICK_MAX_FRAME, now - (this.lastPadTime ?? now));
    this.lastPadTime = now;
    const stick = this.gamepads.rightStick(pads);
    if (frame > 0 && (stick.x || stick.y)) {
      // A curve, so a small tilt scrolls slowly.
      const speed = (v: number) =>
        v * Math.abs(v) * STICK_SCROLL_SPEED * (frame / 1000);
      this.stickScroll(speed(stick.x), speed(stick.y));
    }
  }

  /**
   * Scrolls the focus scope by a delta in CSS pixels, as the right stick
   * does. It sends a wheel to the focused node, or else to the scope's root.
   * Unless a listener prevents it, the nearest scroll container round the
   * node scrolls, or else the first one in the scope that can move.
   */
  stickScroll(dx: number, dy: number): UIInputResult {
    const scope = this.focusScope();
    if (!scope) return 'passed';
    const target = scope.focused ?? scope.root;
    const { x, y, width, height } = target.rect;
    const event = new UIWheelEvent({
      pointerId: KEY_POINTER_ID,
      pointerType: '',
      x: x + width / 2,
      y: y + height / 2,
      deltaX: dx,
      deltaY: dy,
    });
    if (this.send(target, event) === 'prevented') return 'prevented';
    const scroller =
      scrollerFor(target, dx, dy) ?? firstScroller(scope.root, dx, dy);
    scroller?.scrollBy(dx, dy);
    return 'prevented';
  }

  /**
   * Takes the controls that are down now as held, with no keys, so a press
   * that began while the game had the pad does not act in the UI. Call it
   * when the UI gets the pad.
   */
  syncGamepads(pads: readonly (Gamepad | null)[]): void {
    this.gamepads.sync(pads);
  }

  /** Ends the pointer's hover, for a pointer that leaves the source or stops pointing. */
  pointerOut(pointerId: number): void {
    const state = this.pointers.get(pointerId);
    if (!state || state.down || state.game) return;
    this.hover(state, null, state.last);
    this.pointers.delete(pointerId);
  }

  /** Makes the mouse, touch and keys of the element a source. */
  attach(element: HTMLElement, options: UIInputAttachOptions = {}): void {
    this.detach();
    this.element = element;
    this.pageKeys = options.pageKeys ?? true;
    // Touch on the element points, and does not scroll or zoom the page.
    this.touchAction = element.style.touchAction;
    element.style.touchAction = 'none';
    for (const type of POINTER_EVENTS)
      window.addEventListener(type, this.onPointer, true);
    for (const type of MOUSE_EVENTS)
      window.addEventListener(type, this.onMouse, true);
    window.addEventListener('wheel', this.onWheel, {
      capture: true,
      passive: false,
    });
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
    element.addEventListener('pointerleave', this.onLeave);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  detach(): void {
    const element = this.element;
    if (!element) return;
    element.style.touchAction = this.touchAction;
    for (const type of POINTER_EVENTS)
      window.removeEventListener(type, this.onPointer, true);
    for (const type of MOUSE_EVENTS)
      window.removeEventListener(type, this.onMouse, true);
    window.removeEventListener('wheel', this.onWheel, true);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKey, true);
    element.removeEventListener('pointerleave', this.onLeave);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.gamepads.reset();
    this.element = null;
    this.pointers.clear();
  }

  /**
   * The node that takes a point: on the topmost screen surface that has a
   * node there, or that takes all input. A screen point does not reach a
   * world surface.
   */
  private pick(x: number, y: number): UINode | null {
    const surfaces = this.source.surfaces;
    for (let i = surfaces.length - 1; i >= 0; i--) {
      const surface = surfaces[i];
      if (surface.kind !== 'screen') continue;
      if (surface.input === 'none' || !surface.open) continue;
      const hit = pickOn(surface, x, y);
      if (hit) return hit;
    }
    return null;
  }

  private pickScreen: Pick = (x, y) => this.pick(x, y);

  /**
   * The nearest open world surface that takes input and whose front the ray
   * meets within `reach`, with the point it meets. A surface's root blocks
   * the ray, even where it has no node that takes input.
   */
  private castRay(
    origin: UIVector3,
    direction: UIVector3,
    reach: number
  ): SurfaceHit | null {
    let nearest: SurfaceHit | null = null;
    let distance = reach;
    for (const surface of this.source.surfaces) {
      if (surface.kind !== 'world') continue;
      if (surface.input === 'none' || !surface.open) continue;
      const hit = rayToSurface(
        origin,
        direction,
        surface.worldMatrix,
        surface.size,
        surface.pixelsPerMetre
      );
      if (!hit?.front || hit.distance > distance) continue;
      const { x, y } = hit;
      if (x < 0 || y < 0) continue;
      if (x > surface.layoutWidth || y > surface.layoutHeight) continue;
      distance = hit.distance;
      nearest = { surface, x, y };
    }
    return nearest;
  }

  private focusFromPointer(target: UINode): void {
    const surface = target.surface;
    if (surface?.input !== 'all') return;
    surface.setFocus(focusableAncestor(target), false);
  }

  /** Does the default action of a key down. Returns true when it did one. */
  private keyAction(scope: UISurface, init: UIKeyboardInit): boolean {
    const { key } = init;
    const current = scope.focused;
    if (key === 'Tab') {
      const nodes = focusableNodes(scope.root);
      const next = nextInTabOrder(nodes, current, init.shiftKey ?? false);
      if (next) scope.setFocus(next, true);
      this.carry?.keyed();
      // Tab stays in the scope, so it does not move the page's focus.
      return true;
    }
    const direction = ARROWS[key];
    if (direction) {
      const nodes = focusableNodes(scope.root);
      if (!nodes.length) return false;
      const next = current
        ? nearestInDirection(
            nodes.filter((node) => node !== current),
            current.rect,
            direction
          )
        : nodes[0];
      // With nowhere to go, the ring still shows where focus is.
      scope.setFocus(next ?? current, true);
      this.carry?.keyed();
      return true;
    }
    if (key === 'Enter' && current && !init.repeat) {
      this.carry?.keyed();
      if (this.carry?.press(current, init.shiftKey ?? false)) return true;
      const { x, y, width, height } = current.rect;
      this.send(
        current,
        new UIPointerEvent('click', {
          pointerId: KEY_POINTER_ID,
          pointerType: '',
          x: x + width / 2,
          y: y + height / 2,
        })
      );
      return true;
    }
    return false;
  }

  /** True when keys belong to the source while this has focus. */
  private takesKeysFrom(target: EventTarget | null): boolean {
    if (target === this.element) return true;
    return (
      this.pageKeys &&
      (target === null ||
        target === document.body ||
        target === document.documentElement)
    );
  }

  /**
   * Starts a drag when the press is on a scrollbar of the target or of one
   * of its scroll containers. A press on the track, off the thumb, pages
   * towards the press. Returns true when the scrollbar took the press.
   */
  private pressScrollbar(
    state: PointerState,
    target: UINode,
    init: UIPointerInit
  ): boolean {
    if ((init.button ?? 0) !== 0) return false;
    const at = scrollbarAt(target, init.x, init.y);
    if (!at) return false;
    const { node, bar } = at;
    const along = bar.vertical ? init.y : init.x;
    const [thumbStart, thumbLength] = bar.vertical
      ? [bar.thumb.y, bar.thumb.height]
      : [bar.thumb.x, bar.thumb.width];
    if (along >= thumbStart && along < thumbStart + thumbLength) {
      state.bar = {
        node,
        vertical: bar.vertical,
        grab: along - thumbStart,
      };
      node.scrollbarDrag = bar.vertical ? 'y' : 'x';
      node.markDirty(Dirty.Paint);
    } else {
      pageScroll(node, bar, along < thumbStart ? -1 : 1);
    }
    this.onRedraw?.();
    return true;
  }

  /**
   * Starts dragging a touch's scroll container, once the touch moves past
   * the slop on an axis the container scrolls. A node that captured the
   * pointer, such as a slider, keeps it. The node under the touch gets
   * `pointercancel`, and no click.
   */
  private startPan(state: PointerState, init: UIPointerInit): boolean {
    const pan = state.pan;
    if (!pan || this.captured(init.pointerId)) return false;
    const max = maxScroll(pan.node);
    const dx = init.x - pan.x;
    const dy = init.y - pan.y;
    if (
      !(max.x > 0 && Math.abs(dx) > PAN_SLOP) &&
      !(max.y > 0 && Math.abs(dy) > PAN_SLOP)
    )
      return false;
    const down = state.down;
    if (down) this.send(down, new UIPointerEvent('pointercancel', init));
    state.down = null;
    state.panning = true;
    this.hover(state, null, init);
    return this.drag(state, 'move', init) !== 'passed';
  }

  /** A move, an up or a cancel of a pointer that drags a scrollbar or pans. */
  private drag(
    state: PointerState,
    action: UIPointerAction,
    init: UIPointerInit
  ): UIInputResult {
    const { bar, pan } = state;
    if (action === 'move') {
      if (bar) {
        const scrollbar = scrollbars(bar.node).find(
          (b) => b.vertical === bar.vertical
        );
        if (scrollbar) {
          const along = bar.vertical ? init.y : init.x;
          const scroll = scrollForThumb(bar.node, scrollbar, along - bar.grab);
          if (bar.vertical) bar.node.scrollTop = scroll;
          else bar.node.scrollLeft = scroll;
        }
      } else if (pan) {
        // The content follows the finger.
        pan.node.scrollBy(pan.x - init.x, pan.y - init.y);
        pan.x = init.x;
        pan.y = init.y;
      }
      this.onRedraw?.();
      return 'prevented';
    }
    if (bar) {
      bar.node.scrollbarDrag = null;
      bar.node.markDirty(Dirty.Paint);
      this.onRedraw?.();
    }
    state.bar = null;
    state.pan = null;
    state.panning = false;
    state.taken = false;
    if (pointsBetweenPresses(state.type)) {
      if (action === 'up') this.hover(state, state.pick(init.x, init.y), init);
    } else {
      this.pointers.delete(init.pointerId);
    }
    return 'prevented';
  }

  private captured(pointerId: number): UINode | null {
    for (const surface of this.source.surfaces) {
      const node = surface.pointerCaptures.get(pointerId);
      if (!node) continue;
      if (node.surface === surface && surface.open) return node;
      // The node left the tree, or the surface closed.
      surface.pointerCaptures.delete(pointerId);
    }
    return null;
  }

  private releaseCapture(pointerId: number): void {
    for (const surface of this.source.surfaces)
      surface.pointerCaptures.delete(pointerId);
  }

  private cancel(state: PointerState, init: UIPointerInit): UIInputResult {
    const id = init.pointerId;
    if (state.bar || state.panning) {
      this.drag(state, 'cancel', init);
      return 'taken';
    }
    const target = this.captured(id) ?? state.hover[0] ?? null;
    if (target) this.send(target, new UIPointerEvent('pointercancel', init));
    this.releaseCapture(id);
    this.hover(state, null, init);
    this.pointers.delete(id);
    return state.taken ? 'taken' : 'passed';
  }

  /**
   * Moves the hover to the target. Nodes it leaves get `pointerleave`, the
   * innermost first. Nodes it enters get `pointerenter`, the outermost first.
   */
  private hover(
    state: PointerState,
    target: UINode | null,
    init: UIPointerInit
  ): void {
    this.hoverScrollbar(state, target, init);
    const next: UINode[] = [];
    for (let node = target; node; node = node.parent) next.push(node);
    const prev = state.hover;
    state.hover = next;
    for (const node of prev)
      if (!next.includes(node))
        this.send(node, new UIPointerEvent('pointerleave', init));
    for (let i = next.length - 1; i >= 0; i--)
      if (!prev.includes(next[i]))
        this.send(next[i], new UIPointerEvent('pointerenter', init));
  }

  /** Lights the scrollbar under a mouse, as the DOM does. */
  private hoverScrollbar(
    state: PointerState,
    target: UINode | null,
    init: UIPointerInit
  ): void {
    const at =
      target && state.type === 'mouse'
        ? scrollbarAt(target, init.x, init.y)
        : null;
    const node = at?.node ?? null;
    const axis = at ? (at.bar.vertical ? 'y' : 'x') : null;
    const prev = state.barHover;
    if (prev === node && (!node || node.scrollbarHover === axis)) return;
    if (prev) {
      prev.scrollbarHover = null;
      prev.markDirty(Dirty.Paint);
    }
    if (node) {
      node.scrollbarHover = axis;
      node.markDirty(Dirty.Paint);
    }
    state.barHover = node;
    this.onRedraw?.();
  }

  private send(target: UINode, event: UIEvent): UIInputResult {
    target.dispatchEvent(event);
    this.onDispatch?.(event);
    return event.defaultPrevented ? 'prevented' : 'taken';
  }

  /** Screen surfaces share one size, set when they draw. Scales a client point into it. */
  private toSurface(
    clientX: number,
    clientY: number
  ): { x: number; y: number } {
    const rect = this.element!.getBoundingClientRect();
    const surface = this.source.surfaces.find((s) => s.kind === 'screen');
    const scaleX = surface && rect.width ? surface.width / rect.width : 1;
    const scaleY = surface && rect.height ? surface.height / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  private onPointer = (e: PointerEvent): void => {
    const action = POINTER_ACTIONS[e.type as PointerEventType];
    const element = this.element;
    if (!element || origin(e) !== element) {
      // The game's press can end over another element.
      if (action === 'up' || action === 'cancel')
        if (this.pointers.get(e.pointerId)?.game)
          this.pointers.delete(e.pointerId);
      return;
    }
    // A locked mouse has no point on the screen.
    if (e.pointerType === 'mouse' && document.pointerLockElement) return;
    const result = this.pointer(action, {
      ...this.toSurface(e.clientX, e.clientY),
      ...modifiers(e),
      pointerId: e.pointerId,
      pointerType: (e.pointerType || 'mouse') as UIPointerType,
      button: e.button,
      buttons: e.buttons,
    });
    if (action === 'down') this.pressTaken = result !== 'passed';
    if (action === 'move') this.moveTaken = result !== 'passed';
    if (result === 'passed') return;
    e.stopPropagation();
    if (result === 'prevented') e.preventDefault();
    // Keeps the moves and the up of a taken press on the element, even off it.
    if (action === 'down')
      try {
        element.setPointerCapture(e.pointerId);
      } catch {
        // The pointer is no longer active.
      }
  };

  private onMouse = (e: MouseEvent): void => {
    if (origin(e) !== this.element || document.pointerLockElement) return;
    const taken = e.type === 'mousemove' ? this.moveTaken : this.pressTaken;
    if (taken) e.stopPropagation();
    // The right button over a slot opens no menu.
    if (e.type === 'contextmenu' && this.carry) {
      const { x, y } = this.toSurface(e.clientX, e.clientY);
      if (this.carry.slotOf(this.pick(x, y))) e.preventDefault();
    }
  };

  private onWheel = (e: WheelEvent): void => {
    const element = this.element;
    if (!element || origin(e) !== element || document.pointerLockElement)
      return;
    const page = element.getBoundingClientRect().height;
    const scale =
      e.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? LINE_HEIGHT
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? page
        : 1;
    const result = this.wheel({
      ...this.toSurface(e.clientX, e.clientY),
      ...modifiers(e),
      pointerId: MOUSE_POINTER_ID,
      pointerType: 'mouse',
      buttons: e.buttons,
      deltaX: e.deltaX * scale,
      deltaY: e.deltaY * scale,
    });
    if (result === 'passed') return;
    e.stopPropagation();
    if (result === 'prevented') e.preventDefault();
  };

  private onKey = (e: KeyboardEvent): void => {
    // Keys typed into the page's own controls stay theirs.
    if (!this.takesKeysFrom(origin(e))) return;
    const result = this.key(e.type === 'keydown' ? 'down' : 'up', {
      ...modifiers(e),
      key: e.key,
      code: e.code,
      repeat: e.repeat,
    });
    if (result === 'passed') return;
    e.stopPropagation();
    if (result === 'prevented') e.preventDefault();
  };

  private onLeave = (e: PointerEvent): void => {
    this.pointerOut(e.pointerId);
  };

  private onLockChange = (): void => {
    if (!document.pointerLockElement) return;
    for (const [id, state] of this.pointers)
      if (state.type === 'mouse') this.pointerOut(id);
  };
}

/** A ray pointer's point on a surface. */
interface SurfaceHit {
  surface: UISurface;
  x: number;
  y: number;
}

/**
 * The node on the surface that takes a point. A surface that takes all input
 * takes a miss on its root. Other surfaces let a miss through.
 */
function pickOn(surface: UISurface, x: number, y: number): UINode | null {
  const hit = hitTest(surface.root, x, y);
  if (surface.input === 'all') return hit ?? surface.root;
  return hit && hit !== surface.root ? hit : null;
}

/** Where the ray meets the plane of the surface, from either side, or null. */
function surfaceHit(surface: UISurface, ray: UIRayInit): SurfaceHit | null {
  const hit = rayToSurface(
    ray.origin,
    ray.direction,
    surface.worldMatrix,
    surface.size,
    surface.pixelsPerMetre
  );
  return hit && { surface, x: hit.x, y: hit.y };
}

/** A mouse and a ray point between presses. A touch or a pen is gone when it lifts. */
function pointsBetweenPresses(type: UIPointerType): boolean {
  return type === 'mouse' || type === 'ray';
}

/**
 * The element the event started on. At the window, `target` is the outermost
 * shadow host, and the game's canvas is in a shadow root.
 */
function origin(e: Event): EventTarget | null {
  return e.composedPath()[0] ?? e.target;
}

function modifiers(e: MouseEvent | KeyboardEvent) {
  return {
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
  };
}

/** The rect with `SCROLLBAR_GRAB` more on each side. */
function grown(rect: Rect): Rect {
  return {
    x: rect.x - SCROLLBAR_GRAB,
    y: rect.y - SCROLLBAR_GRAB,
    width: rect.width + 2 * SCROLLBAR_GRAB,
    height: rect.height + 2 * SCROLLBAR_GRAB,
  };
}

/** True when the node or one of its ancestors is a scroll container with content to scroll. */
function insideScroller(node: UINode): boolean {
  for (let n: UINode | null = node; n; n = n.parent) {
    const max = maxScroll(n);
    if (max.x > 0 || max.y > 0) return true;
  }
  return false;
}

/** The scrollbar at a point, on the target or on one of its scroll containers, the nearest first. */
function scrollbarAt(
  target: UINode,
  x: number,
  y: number
): { node: UINode; bar: Scrollbar } | null {
  for (let node: UINode | null = target; node; node = node.parent) {
    if (!isScrollContainer(node)) continue;
    const bar = scrollbars(node).find((b) =>
      insideRounded(x, y, grown(b.track), [0, 0, 0, 0])
    );
    if (bar) return { node, bar };
  }
  return null;
}

/** Scrolls by most of the view, towards `direction`, as a press on a scrollbar's track does. */
function pageScroll(node: UINode, bar: Scrollbar, direction: 1 | -1): void {
  const box = innerBox(node);
  const step = direction * 0.9 * (bar.vertical ? box.height : box.width);
  if (bar.vertical) node.scrollBy(0, step);
  else node.scrollBy(step, 0);
}

function commonAncestor(a: UINode, b: UINode): UINode | null {
  const ancestors = new Set<UINode>();
  for (let node: UINode | null = a; node; node = node.parent)
    ancestors.add(node);
  for (let node: UINode | null = b; node; node = node.parent)
    if (ancestors.has(node)) return node;
  return null;
}
