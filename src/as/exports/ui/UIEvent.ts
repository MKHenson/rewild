import { EventAttachable } from "../../core/EventAttachable";
import { UIEventType } from "../../../common/UIEventType";

export class UIEvent extends EventAttachable {
  eventType: UIEventType;

  constructor(eventType: UIEventType) {
    super();
    this.eventType = eventType;
  }
}
