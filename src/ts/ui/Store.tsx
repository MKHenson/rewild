import { Signaller, Callback } from "./Signaller";

/** Stores are used to created Proxied objects which can be observed, mutated and trigger renders on Components*/
export class Store<T extends object> {
  protected _defaultProxy: T;
  protected _signaller: Signaller<T>;

  constructor(target: T) {
    this._signaller = new Signaller<T>(target);
    const [proxy] = this._signaller.proxy();
    this._defaultProxy = proxy;
  }

  setTarget(data: Partial<T>) {
    for (let i in data) this._defaultProxy[i] = data[i]!;
  }

  createProxy(cb?: Callback<T>) {
    return this._signaller.proxy(cb);
  }

  get target(): T {
    return this._signaller.target;
  }

  get defaultProxy(): T {
    return this._defaultProxy;
  }

  get signaller(): Signaller<T> {
    return this._signaller;
  }
}
