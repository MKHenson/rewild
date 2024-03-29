import { ApplicationEvent } from "./ApplicationEvent";
import {
  ApplicationEventType,
  Event,
  EventDispatcher,
  UIEventType,
} from "rewild-common";
import { onSignalReceived } from "../../Imports";

const uiEvent: Event = new Event(UIEventType);

export class UISignalManager extends EventDispatcher {
  onSignalEvent(eventType: ApplicationEventType): void {
    uiEvent.target = this;
    uiEvent.attachment = new ApplicationEvent(eventType);
    this.dispatchEvent(uiEvent);
  }

  signalClientEvent(eventType: ApplicationEventType): void {
    uiEvent.target = this;
    uiEvent.attachment = new ApplicationEvent(eventType);
    onSignalReceived(eventType, uiEvent);
  }
}

export function dispatchOnSignalEvent(eventType: ApplicationEventType): void {
  uiSignaller.onSignalEvent(eventType);
}
export function dispatchSignalClientEvent(
  eventType: ApplicationEventType
): void {
  uiSignaller.signalClientEvent(eventType);
}

export function getSignalManager(): UISignalManager {
  return uiSignaller;
}

export const uiSignaller = new UISignalManager();
