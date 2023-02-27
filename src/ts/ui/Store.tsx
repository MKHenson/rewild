export type UnsubscribeStoreFn = () => void;
export type CallBack = () => void;

export class Store<T extends object> {
  readonly data: T;
  protected defaultProxy: T;
  private listeners: { path?: string; component: CallBack }[];

  constructor(val: T) {
    this.data = val;
    this.listeners = [];
    const [proxy] = this.proxy();
    this.defaultProxy = proxy;
  }

  setTarget(data: Partial<T>) {
    for (let i in data) this.defaultProxy[i] = data[i]!;
  }

  createHandler(parentKey?: string): ProxyHandler<T> {
    const listeners = this.listeners;
    return {
      get: (target: any, key) => {
        if (typeof target[key] === "object" && target[key] !== null) {
          const newProxy = new Proxy(
            target[key],
            this.createHandler(parentKey ? `${parentKey}.${key.toString()}` : key.toString())
          );
          return newProxy;
        } else {
          return target[key];
        }
      },
      set: (target: any, p, newValue, receiver) => {
        // Do nothing if its the same
        if (target[p] === newValue) return true;

        const val = Reflect.set(target, p, newValue, receiver);

        listeners.forEach((l) => {
          if (l.path) {
            if (!(parentKey ? `${parentKey}.${p.toString()}` : p.toString()).startsWith(l.path)) return; // path doesnt match
          }

          l.component();
        });

        return val;
      },
    };
  }

  proxy(component?: CallBack, path?: string): [T, UnsubscribeStoreFn] {
    const listeners = this.listeners;

    if (component) listeners.push({ component, path });

    return [
      new Proxy<T>(this.data, this.createHandler()),
      (() =>
        this.listeners.splice(
          listeners.findIndex((val) => val.component === component),
          1
        )) as UnsubscribeStoreFn,
    ];
  }
}
