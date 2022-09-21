import { DispatchableEvent } from "../EventDispatcher";
import { ApplicationEventType, UIEventType } from "../../../common/EventTypes";

export class ApplicationEvent extends DispatchableEvent {
  eventType: ApplicationEventType;

  constructor() {
    super(UIEventType);
  }
}
