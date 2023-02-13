import { Component } from "./Component";

export type UnsubscribeStoreFn = () => void;

export class Store<T extends object> {
  data: T;
  listeners: { path?: string; component: Component }[];

  constructor(val: T) {
    this.data = val;
    this.listeners = [];
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

          l.component.render();
        });
        return val;
      },
    };
  }

  proxy(component: Component, path?: string): [T, UnsubscribeStoreFn] {
    const listeners = this.listeners;
    listeners.push({ component, path });

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
