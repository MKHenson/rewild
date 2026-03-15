import type { UIElement } from './UIElement';

export type UIPointerEventType =
  | 'click'
  | 'mousedown'
  | 'mouseup'
  | 'mouseenter'
  | 'mouseleave';

export class UIPointerEvent {
  type: UIPointerEventType;
  target: UIElement;
  clientX: f32;
  clientY: f32;
  currentTarget: UIElement;
  private _propagationStopped: boolean = false;

  constructor(
    type: UIPointerEventType,
    target: UIElement,
    clientX: f32,
    clientY: f32
  ) {
    this.type = type;
    this.target = target;
    this.currentTarget = target;
    this.clientX = clientX;
    this.clientY = clientY;
  }

  reset(
    type: UIPointerEventType,
    target: UIElement,
    clientX: f32,
    clientY: f32
  ): void {
    this.type = type;
    this.target = target;
    this.currentTarget = target;
    this.clientX = clientX;
    this.clientY = clientY;
    this._propagationStopped = false;
  }

  stopPropagation(): void {
    this._propagationStopped = true;
  }

  get propagationStopped(): boolean {
    return this._propagationStopped;
  }
}
