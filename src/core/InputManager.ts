import { wasm } from "./WasmManager";
import { MouseEventType, KeyEventType } from "rewild-common";
import { Pane3D } from "rewild-ui/lib/common/Pane3D";

export class InputManager {
  pane3D: Pane3D;

  private onDownHandler: (e: MouseEvent) => void;
  private onUpHandler: (e: MouseEvent) => void;
  private onKeyDownHandler: (e: KeyboardEvent) => void;
  private onKeyUpHandler: (e: KeyboardEvent) => void;
  private onMoveHandler: (e: MouseEvent) => void;
  private onWheelHandler: (e: WheelEvent) => void;
  private onPointerlockChangeHandler: () => void;
  private onPointerlockErrorHandler: () => void;
  private canvasBounds: DOMRect;

  constructor(pane3D: Pane3D) {
    this.pane3D = pane3D;
    this.canvasBounds = pane3D.canvas()!.getBoundingClientRect();

    this.onDownHandler = this.onDown.bind(this);
    this.onUpHandler = this.onUp.bind(this);
    this.onKeyDownHandler = this.onKeyDown.bind(this);
    this.onKeyUpHandler = this.onKeyUp.bind(this);
    this.onMoveHandler = this.onMove.bind(this);
    this.onWheelHandler = this.onWheel.bind(this);
    this.onPointerlockChangeHandler = this.onPointerlockChange.bind(this);
    this.onPointerlockErrorHandler = this.onPointerlockError.bind(this);

    this.pane3D.addEventListener("mousedown", this.onDownHandler);
    window.addEventListener("wheel", this.onWheelHandler);
    window.addEventListener("mouseup", this.onUpHandler);
    window.addEventListener("mousemove", this.onMoveHandler);
    document.addEventListener("keydown", this.onKeyDownHandler);
    document.addEventListener("keyup", this.onKeyUpHandler);
    document.addEventListener("pointerlockchange", this.onPointerlockChangeHandler);
    document.addEventListener("pointerlockerror", this.onPointerlockErrorHandler);

    this.reset();
  }

  private onPointerlockChange() {
    if (this.pane3D.shadow!.pointerLockElement === this.pane3D.canvas()) {
    } else {
      // Signal escape was pushed
      this.sendKeyEvent(KeyEventType.KeyUp, { code: "Escape" });
    }
  }

  private onPointerlockError() {
    console.error("Unable to use Pointer Lock API");
  }

  reset() {
    this.canvasBounds = this.pane3D.canvas()!.getBoundingClientRect();
  }

  private onUp(e: MouseEvent) {
    this.sendMouseEvent(MouseEventType.MouseUp, e, this.canvasBounds, 0);
  }

  private onMove(e: MouseEvent) {
    this.sendMouseEvent(MouseEventType.MouseMove, e, this.canvasBounds, 0);
  }

  private onDown(e: MouseEvent) {
    e.preventDefault();
    this.sendMouseEvent(MouseEventType.MouseDown, e, this.canvasBounds, 0);
  }

  private onKeyDown(e: KeyboardEvent) {
    this.sendKeyEvent(KeyEventType.KeyDown, e);
  }

  private onKeyUp(e: KeyboardEvent) {
    e.preventDefault();
    this.sendKeyEvent(KeyEventType.KeyUp, e);
  }

  private onWheel(e: WheelEvent) {
    this.sendMouseEvent(MouseEventType.MouseWheel, e, this.canvasBounds, e.deltaY);
  }

  private createMouseEvent(e: MouseEvent, bounds: DOMRect, delta: number = 0) {
    return wasm.createMouseEvent(
      e.clientX,
      e.clientY,
      e.pageX,
      e.pageY,
      e.ctrlKey,
      e.shiftKey,
      e.altKey,
      e.button,
      e.buttons,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      delta,
      e.movementX || 0,
      e.movementY || 0
    );
  }

  private sendMouseEvent(type: MouseEventType, event: MouseEvent, bounds: DOMRect, delta: number): void {
    const wasmEvent = this.createMouseEvent(event, bounds, delta);

    if (type === MouseEventType.MouseUp) wasm.dispatchOnMouseDown(wasmEvent);
    else if (type === MouseEventType.MouseMove) wasm.dispatchOnMouseMove(wasmEvent);
    else if (type === MouseEventType.MouseDown) wasm.dispatchOnMouseDown(wasmEvent);
    else if (type === MouseEventType.MouseWheel) wasm.dispatchOnWheel(wasmEvent);
  }

  private sendKeyEvent(type: KeyEventType, event: Partial<KeyboardEvent>): void {
    const wasmEvent = wasm.createKeyboardEvent(event.code!);
    if (type === KeyEventType.KeyUp) wasm.dispatchOnKeyUp(wasmEvent);
    else if (type === KeyEventType.KeyDown) wasm.dispatchOnKeyDown(wasmEvent);
  }

  dispose() {
    this.pane3D.removeEventListener("mousedown", this.onDownHandler);
    window.removeEventListener("mouseup", this.onUpHandler);
    window.removeEventListener("wheel", this.onWheelHandler);
    window.removeEventListener("mousemove", this.onMoveHandler);
    document.removeEventListener("keydown", this.onKeyDownHandler);
    document.removeEventListener("keyup", this.onKeyUpHandler);
    document.removeEventListener("pointerlockchange", this.onPointerlockChangeHandler);
    document.removeEventListener("pointerlockerror", this.onPointerlockErrorHandler);
  }
}
