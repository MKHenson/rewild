import { Event } from "../../core/Event";
import { MouseEvent } from "./MouseEvent";
import { EventDispatcher } from "../../core/EventDispatcher";
import { KeyboardEvent } from "./KeyboardEvent";

const moveEventDown: Event = new Event("mousedown");
const moveEventUp: Event = new Event("mouseup");
const moveEventMove: Event = new Event("mousemove");
const moveEventWheel: Event = new Event("wheel");
const keyDownEvent: Event = new Event("keydown");
const keyUpEvent: Event = new Event("keyup");

export class InputManager extends EventDispatcher {
  onWheel(event: MouseEvent): void {
    moveEventWheel.target = this;
    moveEventWheel.attachment = event;
    this.dispatchEvent(moveEventWheel);
  }

  onMouseDown(event: MouseEvent): void {
    moveEventDown.target = this;
    moveEventDown.attachment = event;
    this.dispatchEvent(moveEventDown);
  }

  onMouseUp(event: MouseEvent): void {
    moveEventUp.target = this;
    moveEventUp.attachment = event;
    this.dispatchEvent(moveEventUp);
  }

  onMouseMove(event: MouseEvent): void {
    moveEventMove.target = this;
    moveEventMove.attachment = event;
    this.dispatchEvent(moveEventMove);
  }

  onKeyDown(event: KeyboardEvent): void {
    keyDownEvent.target = this;
    keyDownEvent.attachment = event;
    this.dispatchEvent(keyDownEvent);
  }

  onKeyUp(event: KeyboardEvent): void {
    keyUpEvent.target = this;
    keyUpEvent.attachment = event;
    this.dispatchEvent(keyUpEvent);
  }
}

export function dispatchOnWheel(mouseEvent: MouseEvent): void {
  inputManager.onWheel(mouseEvent);
}
export function dispatchOnMouseDown(mouseEvent: MouseEvent): void {
  inputManager.onMouseDown(mouseEvent);
}
export function dispatchOnMouseUp(mouseEvent: MouseEvent): void {
  inputManager.onMouseUp(mouseEvent);
}
export function dispatchOnMouseMove(mouseEvent: MouseEvent): void {
  inputManager.onMouseMove(mouseEvent);
}
export function dispatchOnKeyDown(keyEvent: KeyboardEvent): void {
  inputManager.onKeyDown(keyEvent);
}
export function dispatchOnKeyUp(keyEvent: KeyboardEvent): void {
  inputManager.onKeyUp(keyEvent);
}

export function getInputManager(): InputManager {
  return inputManager;
}

export const inputManager = new InputManager();
