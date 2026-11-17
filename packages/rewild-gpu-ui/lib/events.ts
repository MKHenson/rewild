import type { UINode } from './UINode';

export type UIPointerType = 'mouse' | 'touch' | 'pen';

/** The phases of a dispatch, with the same values as the DOM's `Event` constants. */
export enum UIEventPhase {
  None = 0,
  Capture = 1,
  Target = 2,
  Bubble = 3,
}

export interface UIModifiers {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** An event sent through a UI tree, in the same phases as a DOM event. */
export class UIEvent {
  target: UINode | null = null;
  currentTarget: UINode | null = null;
  eventPhase = UIEventPhase.None;
  private stopped = false;
  private prevented = false;

  constructor(readonly type: UIEventType, readonly bubbles: boolean) {}

  get propagationStopped(): boolean {
    return this.stopped;
  }

  get defaultPrevented(): boolean {
    return this.prevented;
  }

  /** The other listeners on the current node still run. */
  stopPropagation(): void {
    this.stopped = true;
  }

  /** Also prevents the browser's default action for the source DOM event. */
  preventDefault(): void {
    this.prevented = true;
  }
}

export interface UIPointerInit extends Partial<UIModifiers> {
  pointerId: number;
  pointerType: UIPointerType;
  /** In surface CSS pixels. */
  x: number;
  y: number;
  /** The button that changed, as in the DOM: 0 is the main button. */
  button?: number;
  /** The buttons that are down, as a DOM bit mask. */
  buttons?: number;
}

export type UIPointerEventType =
  | 'pointerdown'
  | 'pointerup'
  | 'pointermove'
  | 'pointercancel'
  | 'pointerenter'
  | 'pointerleave'
  | 'click';

export class UIPointerEvent extends UIEvent implements UIModifiers {
  readonly pointerId: number;
  readonly pointerType: UIPointerType;
  /** In surface CSS pixels. */
  readonly x: number;
  readonly y: number;
  readonly button: number;
  readonly buttons: number;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;

  constructor(type: UIPointerEventType | 'wheel', init: UIPointerInit) {
    // Enter and leave do not bubble, as in the DOM.
    super(type, type !== 'pointerenter' && type !== 'pointerleave');
    this.pointerId = init.pointerId;
    this.pointerType = init.pointerType;
    this.x = init.x;
    this.y = init.y;
    this.button = init.button ?? 0;
    this.buttons = init.buttons ?? 0;
    this.altKey = init.altKey ?? false;
    this.ctrlKey = init.ctrlKey ?? false;
    this.metaKey = init.metaKey ?? false;
    this.shiftKey = init.shiftKey ?? false;
  }
}

export interface UIWheelInit extends UIPointerInit {
  /** In CSS pixels. */
  deltaX: number;
  deltaY: number;
}

export class UIWheelEvent extends UIPointerEvent {
  readonly deltaX: number;
  readonly deltaY: number;

  constructor(init: UIWheelInit) {
    super('wheel', init);
    this.deltaX = init.deltaX;
    this.deltaY = init.deltaY;
  }
}

export interface UIKeyboardInit extends Partial<UIModifiers> {
  /** The DOM's `key`, such as `Enter` or `a`. */
  key: string;
  /** The DOM's `code`, the physical key, such as `KeyA`. */
  code: string;
  repeat?: boolean;
}

export class UIKeyboardEvent extends UIEvent implements UIModifiers {
  readonly key: string;
  readonly code: string;
  readonly repeat: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;

  constructor(type: 'keydown' | 'keyup', init: UIKeyboardInit) {
    super(type, true);
    this.key = init.key;
    this.code = init.code;
    this.repeat = init.repeat ?? false;
    this.altKey = init.altKey ?? false;
    this.ctrlKey = init.ctrlKey ?? false;
    this.metaKey = init.metaKey ?? false;
    this.shiftKey = init.shiftKey ?? false;
  }
}

/** The event each type sends to its listeners. */
export interface UIEventMap {
  pointerdown: UIPointerEvent;
  pointerup: UIPointerEvent;
  pointermove: UIPointerEvent;
  pointercancel: UIPointerEvent;
  pointerenter: UIPointerEvent;
  pointerleave: UIPointerEvent;
  click: UIPointerEvent;
  wheel: UIWheelEvent;
  keydown: UIKeyboardEvent;
  keyup: UIKeyboardEvent;
}

export type UIEventType = keyof UIEventMap;

export type UIEventListener<K extends UIEventType> = (
  event: UIEventMap[K]
) => void;

export interface UIListenerOptions {
  /** Runs in the capture phase, down from the root, before the target. */
  capture?: boolean;
}
