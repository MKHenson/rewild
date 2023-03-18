type DotPrefix<T extends string> = T extends "" ? "" : `.${T}`;

type DotNestedKeys<T> = T extends Date | Function | Array<any>
  ? ""
  : (
      T extends object
        ? { [K in Exclude<keyof T, symbol>]: `${K}${DotPrefix<DotNestedKeys<T[K]>>}` }[Exclude<keyof T, symbol>]
        : ""
    ) extends infer D
  ? Extract<D, string>
  : never;

export type UnsubscribeStoreFn = () => void;
export type Callback<T> = (prop: DotNestedKeys<T>, prevValue: any, value: any) => void;

export class Signaller<T extends object> {
  readonly target: T;
  private listeners: Callback<T>[];
  private proxies: Map<string, typeof Proxy>;
  public __debuggerGetDelegate?: (target: any, key: string | symbol) => void;

  constructor(target: T) {
    this.target = target;
    this.listeners = [];
    this.proxies = new Map();
  }

  /** Creates a proxy of the store's target*/
  proxy(cb?: Callback<T>): [T, UnsubscribeStoreFn] {
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

  getListeners() {
    return this.listeners;
  }

  private setHandlers(parentKey?: string): ProxyHandler<T> {
    const listeners = this.listeners;
    const proxies = this.proxies;

    return {
      get: (target: any, key) => {
        if (key === "__isProxy") return true;
        if (typeof target[key] === "object" && target[key] !== null) {
          const path = parentKey ? `${parentKey}.${key.toString()}` : key.toString();
          this.__debuggerGetDelegate?.(target, key);

          if (proxies.has(path)) {
            return proxies.get(path);
          }

          const newProxy = target[key].__isProxy ? target[key] : new Proxy(target[key], this.setHandlers(path));

          proxies.set(path, newProxy);

          return newProxy;
        } else {
          return target[key];
        }
      },
      set: (target: any, p, newValue, receiver) => {
        const path = parentKey ? `${parentKey}.${p.toString()}` : p.toString();

        // Do nothing if its the same value
        if (target[p] === newValue) return true;
        const prevValue = Reflect.get(target, p, receiver);
        const proxies = this.proxies;

        if (proxies.has(path)) proxies.delete(path);

        // Delete any other nested proxies of this path
        const keys = proxies.keys();
        for (const key of keys) {
          if (key.startsWith(path + ".") && proxies.get(key) !== newValue) {
            proxies.delete(key);
          }
        }

        const validReturn = Reflect.set(target, p, newValue, receiver);

        listeners.forEach((l) => {
          l((parentKey ? `${parentKey}.${p.toString()}` : p.toString()) as DotNestedKeys<T>, prevValue, newValue);
        });
        return validReturn;
      },
    };
  }
}
