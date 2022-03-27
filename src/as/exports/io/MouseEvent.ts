import { EventAttachable } from "../../core/EventAttachable";

export class MouseEvent extends EventAttachable {
  constructor(
    public clientX: i32,
    public clientY: i32,
    public pageX: i32,
    public pageY: i32,
    public ctrlKey: boolean,
    public shiftKey: boolean,
    public altKey: boolean,
    public button: i32,
    public buttons: i32,
    public targetX: i32,
    public targetY: i32,
    public targetWidth: i32,
    public targetHeight: i32,
    public delta: i16
  ) {
    super();
  }
}

export function createMouseEvent(
  clientX: i32,
  clientY: i32,
  pageX: i32,
  pageY: i32,
  ctrlKey: boolean,
  shiftKey: boolean,
  altKey: boolean,
  button: i32,
  buttons: i32,
  targetX: i32,
  targetY: i32,
  targetWidth: i32,
  targetHeight: i32,
  delta: i16
): MouseEvent {
  return new MouseEvent(
    clientX,
    clientY,
    pageX,
    pageY,
    ctrlKey,
    shiftKey,
    altKey,
    button,
    buttons,
    targetX,
    targetY,
    targetWidth,
    targetHeight,
    delta
  );
}
