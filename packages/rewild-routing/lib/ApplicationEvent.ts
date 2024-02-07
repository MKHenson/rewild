import { EventAttachable } from "rewild-common";
import { ApplicationEventType } from "rewild-common";

export class ApplicationEvent extends EventAttachable {
  eventType: ApplicationEventType;

  constructor(eventType: ApplicationEventType) {
    super();
    this.eventType = eventType;
  }
}
