import { DispatchableEvent } from "../EventDispatcher";
import { ApplicationEventType, UIEventType } from "@rewild/common";

export class ApplicationEvent extends DispatchableEvent {
  eventType: ApplicationEventType;

  constructor() {
    super(UIEventType);
  }
}
