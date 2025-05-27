export type Subscriber<T> = (event: T) => void;

export class Dispatcher<T> {
  listeners: Subscriber<T>[] = [];

  add(listener: Subscriber<T>): void {
    this.listeners.push(listener);
  }

  remove(listener: Subscriber<T>): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  dispatch(event: T): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  clear(): void {
    this.listeners = [];
  }
}
