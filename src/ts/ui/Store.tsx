import { Signaller, Callback } from "./Signaller";

/** Stores are used to created Proxied objects which can be observed, mutated and trigger renders on Components*/
export class Store<T extends object> {
  protected _defaultProxy: T;
  protected signaller: Signaller<T>;

  constructor(target: T) {
    this.signaller = new Signaller<T>(target);
    const [proxy] = this.signaller.proxy();
    this._defaultProxy = proxy;
  }

  setTarget(data: Partial<T>) {
    for (let i in data) this._defaultProxy[i] = data[i]!;
  }

  createProxy(cb?: Callback<T>) {
    return this.signaller.proxy(cb);
  }

  get target(): T {
    return this.signaller.target;
  }

  get defaultProxy(): T {
    return this._defaultProxy;
  }
}
