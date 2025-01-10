type DotPrefix<T extends string> = T extends '' ? '' : `.${T}`;

type DotNestedKeys<T> = T extends Date | Function | Array<any>
  ? ''
  : (
      T extends object
        ? {
            [K in Exclude<keyof T, symbol>]: `${K}${DotPrefix<
              DotNestedKeys<T[K]>
            >}`;
          }[Exclude<keyof T, symbol>]
        : ''
    ) extends infer D
  ? Extract<D, string>
  : never;

export type UnsubscribeStoreFn = () => void;
export type RescribeStoreFn = undefined | (() => void);
export type Callback<T> = (
  prop: DotNestedKeys<T>,
  prevValue: any,
  value: any
) => void;

export class Signaller<T extends object> {
  readonly target: T;
  private listeners: Callback<T>[];
  private _proxies: Map<string, typeof Proxy>;
  public __debuggerGetDelegate?: (target: any, key: string | symbol) => void;

  constructor(target: T) {
    this.target = target;
    this.listeners = [];
    this._proxies = new Map();
  }

  /** Creates a proxy of the store's target*/
  proxy(cb?: Callback<T>): [T, UnsubscribeStoreFn, RescribeStoreFn] {
    const listeners = this.listeners;

    if (cb) listeners.push(cb);

    return [
      new Proxy<T>(this.target, this.setHandlers()),
      (() =>
        listeners.splice(
          listeners.findIndex((val) => val === cb),
          1
        )) as UnsubscribeStoreFn,
      cb ? () => listeners.push(cb) : undefined,
    ];
  }

  _getListeners() {
    return this.listeners;
  }

  _getProxies() {
    return this._proxies;
  }

  private stripProxyChildren(obj: any, key: string | symbol) {
    const targetValue = obj[key];

    if (targetValue !== null && targetValue.__isProxy) {
      obj[key] = targetValue.__source;
    }

    const keys = Object.keys(targetValue);
    for (const childKey of keys) {
      if (
        typeof targetValue[childKey] === 'object' &&
        targetValue[childKey] !== null
      )
        this.stripProxyChildren(targetValue, childKey);
    }
  }

  /**
   * When we set an object on one of the proxy's properties, we need to ensure its raw JS objects and not other proxies.
   * This function will strip all proxies from the object and its children
   */
  private stripProxies(obj: any) {
    let toReturn = obj;
    if (obj.__isProxy) {
      toReturn = obj.__source;
    }

    const keys = Object.keys(toReturn);

    for (const key of keys) {
      if (typeof toReturn[key] === 'object' && toReturn[key] !== null) {
        this.stripProxyChildren(toReturn, key);
      }
    }

    return toReturn;
  }

  /** Creates the getters and setters for a proxy */
  private setHandlers(parentKey?: string): ProxyHandler<T> {
    const listeners = this.listeners;
    const proxies = this._proxies;

    return {
      get: (target: any, key) => {
        if (key === '__isProxy') return true;
        if (key === '__source') return target;

        // If the key is an object, we need to create a new proxy for it
        if (typeof target[key] === 'object' && target[key] !== null) {
          const path = parentKey
            ? `${parentKey}.${key.toString()}`
            : key.toString();
          this.__debuggerGetDelegate?.(target, key);

          if (proxies.has(path)) {
            return proxies.get(path);
          }

          const newProxy = target[key].__isProxy
            ? target[key]
            : new Proxy(target[key], this.setHandlers(path));

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
        const proxies = this._proxies;

        // Remove any existing proxy for this path as we're going to replace it
        if (proxies.has(path)) proxies.delete(path);

        // Delete any other proxies that may have been created for children of this object
        const keys = proxies.keys();
        for (const key of keys) {
          if (key.startsWith(path + '.') && proxies.get(key) !== newValue) {
            proxies.delete(key);
          }
        }

        // Remove all proxies from the new object we're setting
        const originalRef = this.stripProxies(newValue);

        const validReturn = Reflect.set(target, p, originalRef, receiver);

        listeners.forEach((l) => {
          l(
            (parentKey
              ? `${parentKey}.${p.toString()}`
              : p.toString()) as DotNestedKeys<T>,
            prevValue,
            originalRef
          );
        });
        return validReturn;
      },
    };
  }
}
