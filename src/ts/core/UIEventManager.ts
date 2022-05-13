import { UIEventType } from "../../common/UIEventType";
import EventDispatcher from "./EventDispatcher";
import { UIEvent } from "./events/UIEvent";
import { IBindable } from "./IBindable";
import { wasm } from "./WasmManager";

const uiEvent: UIEvent = new UIEvent();

export class UIEventManager extends EventDispatcher implements IBindable {
  constructor() {
    super();
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
    wasm.dispatchOnSignalEvent(type);
  }
}
