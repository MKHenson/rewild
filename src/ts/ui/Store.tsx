import { Signaller, Callback } from "./Signaller";

/** Stores are used to created Proxied objects which can be observed, mutated and trigger renders on Components*/
export class Store<T extends object> {
  protected defaultProxy: T;
  protected signaller: Signaller<T>;

  constructor(target: T) {
    this.signaller = new Signaller<T>(target);
    const [proxy] = this.signaller.proxy();
    this.defaultProxy = proxy;
  }

  setTarget(data: Partial<T>) {
    for (let i in data) this.defaultProxy[i] = data[i]!;
  }

  createProxy(cb?: Callback<T>) {
    return this.signaller.proxy(cb);
  }
}
