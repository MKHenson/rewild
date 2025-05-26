export type Subscriber<T> = (event: T) => void;

export class Dispatcher<T> {
  listeners: Subscriber<T>[] = [];

  add(listener: Subscriber<T>) {
    this.listeners.push(listener);
  }

  remove(listener: Subscriber<T>) {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  dispatch(event: T) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  clear() {
    this.listeners = [];
  }
}
