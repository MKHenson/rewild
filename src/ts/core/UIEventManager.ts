import { UIEventType } from "../../common/UIEventType";
import EventDispatcher from "./EventDispatcher";
import { UIEvent } from "./events/UIEvent";
import { IBindable } from "./IBindable";
import { WasmManager } from "./WasmManager";

const uiEvent: UIEvent = new UIEvent();

export class UIEventManager extends EventDispatcher implements IBindable {
  wasmManager: WasmManager;

  constructor(wasm: WasmManager) {
    super();
    this.wasmManager = wasm;
  }

  createBinding(): any {
    return {
      onSignalReceived: this.onSignalReceived.bind(this),
    };
  }

  onSignalReceived(type: UIEventType, event: number) {
    uiEvent.uiEventType = type;
    this.dispatchEvent(uiEvent);
  }

  triggerUIEvent(type: UIEventType) {
    const wasmExports = this.wasmManager.exports;
    const manager = wasmExports.UISignalManager.wrap(wasmExports.getSignalManager());
    manager.onSignalEvent(type);
  }
}
