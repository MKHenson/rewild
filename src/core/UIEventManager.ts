import { ApplicationEventType } from 'rewild-common';
import { wasm, IBindable } from 'rewild-wasmtime';
import EventDispatcher from './EventDispatcher';
import { ApplicationEvent } from './events/ApplicationEvent';

const uiEvent: ApplicationEvent = new ApplicationEvent();

export class UIEventManager extends EventDispatcher implements IBindable {
  constructor() {
    super();
  }

  createBinding(): any {
    return {
      onSignalReceived: this.onSignalReceived.bind(this),
    };
  }

  onSignalReceived(type: ApplicationEventType, event: number) {
    uiEvent.eventType = type;
    this.dispatchEvent(uiEvent);
  }

  triggerUIEvent(type: ApplicationEventType) {
    wasm.dispatchOnSignalEvent(type);
  }
}
