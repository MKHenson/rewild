export type UnsubscribeStoreFn = () => void;
export type Callback = (prop: string, prevValue: any, value: any, path: string) => void;

// "Marks" proxies, but does not prevent them
// from being garbage-collected
const proxies = new WeakSet<typeof Proxy>();

export class Signaller<T extends object> {
  readonly target: T;
  private listeners: Callback[];

  constructor(target: T) {
    this.target = target;
    this.listeners = [];
  }

  /** Creates a proxy of the store's target*/
  proxy(cb?: Callback, path?: string): [T, UnsubscribeStoreFn] {
    const listeners = this.listeners;

    if (cb) listeners.push(cb);

    return [
      new Proxy<T>(this.target, this.setHandlers()),
      (() =>
        this.listeners.splice(
          listeners.findIndex((val) => val === cb),
          1
        )) as UnsubscribeStoreFn,
    ];
  }

  private setHandlers(parentKey?: string): ProxyHandler<T> {
    const listeners = this.listeners;
    return {
      get: (target: any, key) => {
        if (typeof target[key] === "object" && target[key] !== null) {
          if (proxies.has(target[key])) {
            return target[key];
          }

          const newProxy = new Proxy(
            target[key],
            this.setHandlers(parentKey ? `${parentKey}.${key.toString()}` : key.toString())
          );

          proxies.add(newProxy);

          return newProxy;
        } else {
          return target[key];
        }
      },
      set: (target: any, p, newValue, receiver) => {
        // Do nothing if its the same value
        if (target[p] === newValue) return true;
        const prevValue = receiver[p];
        if (proxies.has(prevValue)) {
          proxies.delete(prevValue);
        }
        const validReturn = Reflect.set(target, p, newValue, receiver);

        listeners.forEach((l) => {
          l(p as string, prevValue, newValue, parentKey ? `${parentKey}.${p.toString()}` : p.toString());
        });
        return validReturn;
      },
    };
  }
}
