import { Event } from "../../core/Event";
import { UIEvent } from "./UIEvent";
import { UIEventType } from "../../../common/UIEventType";
import { EventDispatcher } from "../../core/EventDispatcher";
import { onSignalReceived } from "../../Imports";

const uiEvent: Event = new Event("uievent");

export class UISignalManager extends EventDispatcher {
  onSignalEvent(eventType: UIEventType): void {
    uiEvent.target = this;
    uiEvent.attachment = new UIEvent(eventType);
    this.dispatchEvent(uiEvent);
  }

  signalClientEvent(eventType: UIEventType): void {
    uiEvent.target = this;
    uiEvent.attachment = new UIEvent(eventType);
    onSignalReceived(eventType, uiEvent);
  }
}

export function getSignalManager(): UISignalManager {
  return uiSignaller;
}

export const uiSignaller = new UISignalManager();
