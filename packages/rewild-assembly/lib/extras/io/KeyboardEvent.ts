import { EventAttachable } from "rewild-common";

export class KeyboardEvent extends EventAttachable {
  constructor(public code: string) {
    super();
  }
}

export function createKeyboardEvent(code: string): KeyboardEvent {
  return new KeyboardEvent(code);
}
