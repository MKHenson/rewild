/**
 * @author mrdoob / http://mrdoob.com/
 * @author Joe Pea / http://github.com/trusktr
 * @author corruptedzulu / http://github.com/corruptedzulu
 */

import { Event } from "./Event";
import { EventTargetable } from "./EventTargetable";

export interface Listener {
  onEvent(event: Event): void;
}

export type ListenerArray = Array<Listener>;

/**
 * https://github.com/mrdoob/eventdispatcher.js/
 */
export class EventDispatcher extends EventTargetable {
  private _listeners: Map<string, ListenerArray> = new Map();

  /**
   * Adds a listener to an event type.
   * @param type The type of event to listen to.
   * @param listener The function that gets called when the event is fired.
   */
  addEventListener(type: string, listener: Listener): void {
    const listeners = this._listeners;

    if (!listeners.has(type)) {
      listeners.set(type, new Array<Listener>());
    }

    if (listeners.get(type).indexOf(listener) === -1) {
      listeners.get(type).push(listener);
    }
  }

  /**
   * Checks if listener is added to an event type.
   * @param type The type of event to listen to.
   * @param listener The function that gets called when the event is fired.
   */
  hasEventListener(type: string, listener: Listener): bool {
    const listeners = this._listeners;

    return listeners.has(type) && listeners.get(type).includes(listener);
  }

  /**
   * Checks if any listener is added to an event type.
   * @param type The type of event to listen to.
   */
  hasAnyEventListener(type: string): bool {
    const listeners = this._listeners;
    return listeners.has(type) && listeners.get(type).length > 0;
  }

  /**
   * Removes a listener from an event type.
   * @param type The type of the listener that gets removed.
   * @param listener The listener function that gets removed.
   */
  removeEventListener(type: string, listener: Listener): void {
    const listeners = this._listeners;

    if (listeners.has(type)) {
      const listenerArray = listeners.get(type);
      const index = listenerArray.indexOf(listener);

      if (index != -1) {
        listenerArray.splice(index, 1);
      }
    }
  }

  /**
   * Fire an event type.
   * @param type The type of event that gets fired.
   */
  dispatchEvent(event: Event): void {
    const listeners = this._listeners;

    if (listeners.has(event.type)) {
      const listenerArray = listeners.get(event.type);

      event.target = this;

      // clone the array, in case listeners are added or removed during the
      // following iteration
      const array: Listener[] = listenerArray.slice(0);

      for (let i: i32 = 0, l: i32 = array.length; i < l; i++) {
        let theListener: Listener = array[i];
        // theListener(event) // no type error here. Why?????
        theListener.onEvent(event);
      }
    }
  }
}
