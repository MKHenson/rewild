/**
 * Vehicle for dispatching DispatchableEvent objects.
 *
 * @author Jeremy Daley
 * @version 0.0.1
 * @export
 * @class EventDispatcher
 * @implements {EventTarget}
 */

export default class EventDispatcher implements EventTarget {
  public listeners: any = {};
  public target: any = null;

  constructor() {}

  /**
   * Add a listener for an event type.
   *
   * @param {string} type Type of event.
   * @param {*} callback Callback for dispatched event.
   * @memberof EventDispatcher
   */
  public addEventListener(type: string, callback: any) {
    if (!(type in this.listeners)) {
      this.listeners[type] = [];
    }

    this.listeners[type].push(callback);
  }

  /**
   * Removes a listener that's been added.
   *
   * @param {string} type Type of event.
   * @param {any} callback Callback for dispatched event.
   * @returns
   * @memberof EventDispatcher
   */
  public removeEventListener(type: string, callback: any) {
    if (!(type in this.listeners)) {
      return;
    }
    var stack = this.listeners[type];
    for (let i = 0, l = stack.length; i < l; i++) {
      if (stack[i] === callback) {
        stack.splice(i, 1);
        return;
      }
    }
  }

  /**
   * Dispatches an event to any listeners.
   *
   * @param {DispatchableEvent} event An event object to dispatch.
   * @returns
   * @memberof EventDispatcher
   */
  public dispatchEvent(event: DispatchableEvent) {
    if (!(event.type in this.listeners)) {
      return true;
    }

    let stack = this.listeners[event.type];

    for (let i = 0, l = stack.length; i < l; i++) {
      stack[i].call(this, event);
    }

    return false;
  }
}

/**
 * Generic event for dispatching through an EventDispatcher.
 *
 * @export
 * @class DispatchableEvent
 */
export class DispatchableEvent {
  public type: string;

  /**
   * Instantiates a new DispatchableEvent object
   *
   * @param {string} type Type of event.
   * @memberof DispatchableEvent
   */
  constructor(type: string) {
    this.type = type;
  }
}
