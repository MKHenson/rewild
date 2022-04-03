import { DispatchableEvent } from "../EventDispatcher";
import { EventType } from "./eventTypes";
import { UIEventType } from "../../../common/UIEventType";

export class UIEvent extends DispatchableEvent {
  uiEventType: UIEventType;

  constructor() {
    super("uievent" as EventType);
  }
}
