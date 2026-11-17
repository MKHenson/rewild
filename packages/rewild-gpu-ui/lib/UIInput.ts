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
import { hitTest } from './hitTest';
import type { UINode } from './UINode';
import type { UISurface } from './UISurface';

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

interface PointerState {
  type: UIPointerType;
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

/**
 * Turns pointer and key input into UI events on the surfaces' trees.
 *
 * Sources call `pointer`, `wheel` and `key` with points in surface CSS
 * pixels. `attach` makes the mouse and touch of an element such as the game's
 * canvas a source. When a surface takes a DOM event, the event stops at the
 * window, so no listener of the game gets it.
 */
export class UIInput {
  /** Called after each event the input sends. */
  onDispatch: ((event: UIEvent) => void) | null = null;
  private pointers = new Map<number, PointerState>();
  private element: HTMLElement | null = null;
  private touchAction = '';
  /** Whether the last DOM pointer down and pointer move were taken, for the mouse events after them. */
  private pressTaken = false;
  private moveTaken = false;

  constructor(private source: UISurfaceList) {}

  /**
   * Sends one pointer input. The target is the node that captured the
   * pointer, or else the topmost node under it. A down that no surface takes
   * belongs to the game, and the UI ignores the pointer until it is up.
   */
  pointer(action: UIPointerAction, init: UIPointerInit): UIInputResult {
    const id = init.pointerId;
    let state = this.pointers.get(id);
    if (!state) {
      state = {
        type: init.pointerType,
        last: init,
        hover: [],
        down: null,
        taken: false,
        game: false,
      };
      this.pointers.set(id, state);
    }
    state.last = init;
    if (state.game) {
      if (action === 'up' || action === 'cancel') this.pointers.delete(id);
      return 'passed';
    }
    if (action === 'cancel') return this.cancel(state, init);

    const target = this.captured(id) ?? this.pick(init.x, init.y);
    this.hover(state, target, init);

    if (action === 'down') {
      if (!target) {
        state.game = true;
        return 'passed';
      }
      state.down = target;
      state.taken = true;
      return this.send(target, new UIPointerEvent('pointerdown', init));
    }

    if (action === 'move') {
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
    // as in the DOM. Only the main button clicks.
    const at = target && state.down && commonAncestor(state.down, target);
    if (at && (init.button ?? 0) === 0)
      this.send(at, new UIPointerEvent('click', init));
    this.releaseCapture(id);
    state.down = null;
    state.taken = false;
    if (state.type === 'mouse') {
      this.hover(state, this.pick(init.x, init.y), init);
    } else {
      // A touch is gone when it lifts.
      this.hover(state, null, init);
      this.pointers.delete(id);
    }
    return result;
  }

  /** Sends a wheel to the node under the pointer. */
  wheel(init: UIWheelInit): UIInputResult {
    const target = this.captured(init.pointerId) ?? this.pick(init.x, init.y);
    return target ? this.send(target, new UIWheelEvent(init)) : 'passed';
  }

  /** Sends a key to the root of the topmost open surface that takes all input. */
  key(action: 'down' | 'up', init: UIKeyboardInit): UIInputResult {
    const surfaces = this.source.surfaces;
    for (let i = surfaces.length - 1; i >= 0; i--) {
      const surface = surfaces[i];
      if (surface.input !== 'all' || !surface.open) continue;
      const type = action === 'down' ? 'keydown' : 'keyup';
      return this.send(surface.root, new UIKeyboardEvent(type, init));
    }
    return 'passed';
  }

  /** Ends the pointer's hover, for a pointer that leaves the source or stops pointing. */
  pointerOut(pointerId: number): void {
    const state = this.pointers.get(pointerId);
    if (!state || state.down || state.game) return;
    this.hover(state, null, state.last);
    this.pointers.delete(pointerId);
  }

  /** Makes the mouse and touch of the element a source. */
  attach(element: HTMLElement): void {
    this.detach();
    this.element = element;
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
    this.element = null;
    this.pointers.clear();
  }

  /**
   * The node that takes a point: on the topmost surface that has a node
   * there, or that takes all input.
   */
  private pick(x: number, y: number): UINode | null {
    const surfaces = this.source.surfaces;
    for (let i = surfaces.length - 1; i >= 0; i--) {
      const surface = surfaces[i];
      if (surface.input === 'none' || !surface.open) continue;
      const hit = hitTest(surface.root, x, y);
      if (surface.input === 'all') return hit ?? surface.root;
      if (hit && hit !== surface.root) return hit;
    }
    return null;
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
    const surface = this.source.surfaces[0];
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
    if (!element || e.target !== element) {
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
    if (e.target !== this.element || document.pointerLockElement) return;
    const taken = e.type === 'mousemove' ? this.moveTaken : this.pressTaken;
    if (taken) e.stopPropagation();
  };

  private onWheel = (e: WheelEvent): void => {
    const element = this.element;
    if (!element || e.target !== element || document.pointerLockElement) return;
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
    const target = e.target;
    if (
      target !== this.element &&
      target !== document.body &&
      target !== document.documentElement
    )
      return;
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

function modifiers(e: MouseEvent | KeyboardEvent) {
  return {
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
  };
}

function commonAncestor(a: UINode, b: UINode): UINode | null {
  const ancestors = new Set<UINode>();
  for (let node: UINode | null = a; node; node = node.parent)
    ancestors.add(node);
  for (let node: UINode | null = b; node; node = node.parent)
    if (ancestors.has(node)) return node;
  return null;
}
