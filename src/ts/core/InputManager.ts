import { WasmManager } from "./WasmManager";

export enum MouseEventType {
  MouseDown,
  MouseUp,
  MouseMove,
  MouseWheel,
}

export class InputManager {
  canvas: HTMLCanvasElement;
  wasmManager: WasmManager;

  private onDownHandler: (e: MouseEvent) => void;
  private onUpHandler: (e: MouseEvent) => void;
  private onMoveHandler: (e: MouseEvent) => void;
  private onWheelHandler: (e: WheelEvent) => void;
  private canvasBounds: DOMRect;

  constructor(canvas: HTMLCanvasElement, wasm: WasmManager) {
    this.wasmManager = wasm;
    this.canvas = canvas;
    this.canvasBounds = canvas.getBoundingClientRect();

    this.onDownHandler = this.onDown.bind(this);
    this.onUpHandler = this.onUp.bind(this);
    this.onMoveHandler = this.onMove.bind(this);
    this.onWheelHandler = this.onWheel.bind(this);

    this.canvas.addEventListener("mousedown", this.onDownHandler);
    window.addEventListener("wheel", this.onWheelHandler);
    window.addEventListener("mouseup", this.onUpHandler);
    window.addEventListener("mousemove", this.onMoveHandler);

    this.reset();
  }

  reset() {
    this.canvasBounds = this.canvas.getBoundingClientRect();
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

  private onWheel(e: WheelEvent) {
    this.sendMouseEvent(MouseEventType.MouseWheel, e, this.canvasBounds, e.deltaY);
  }

  private createMouseEvent(e: MouseEvent, bounds: DOMRect, delta: number = 0) {
    const wasmExports = this.wasmManager.exports;
    const mouseEventPtr = wasmExports.__pin(
      wasmExports.ASInputManager.createMouseEvent(
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
        delta
      )
    );
    wasmExports.ASInputManager.MouseEvent.wrap(mouseEventPtr);
    return mouseEventPtr;
  }

  private sendMouseEvent(type: MouseEventType, event: MouseEvent, bounds: DOMRect, delta: number): void {
    const wasmExports = this.wasmManager.exports;
    const manager = wasmExports.ASInputManager.InputManager.wrap(wasmExports.ASInputManager.getInputManager());
    const wasmEvent = this.createMouseEvent(event, bounds, delta);

    if (type === MouseEventType.MouseUp) manager.onMouseUp(wasmEvent);
    else if (type === MouseEventType.MouseMove) manager.onMouseMove(wasmEvent);
    else if (type === MouseEventType.MouseDown) manager.onMouseDown(wasmEvent);
    else if (type === MouseEventType.MouseWheel) manager.onWheel(wasmEvent);

    wasmExports.__unpin(wasmEvent);
  }

  dispose() {
    this.canvas.removeEventListener("mousedown", this.onDownHandler);
    window.removeEventListener("wheel", this.onWheelHandler);
    window.removeEventListener("mouseup", this.onUpHandler);
    window.removeEventListener("mousemove", this.onMoveHandler);
  }
}
