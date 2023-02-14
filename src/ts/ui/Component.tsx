import { Store, UnsubscribeStoreFn } from "./Store";

type RenderFn = () => void;

export function register<T extends CustomElementConstructor | JSX.ComponentStatic>(tagName: string) {
  return <U extends T>(constructor: U) => {
    // register component
    customElements.define(tagName, constructor as CustomElementConstructor);

    (constructor as JSX.ComponentStatic).tagName = tagName;
  };
}

export interface ComponentOptions<T> {
  props?: Partial<T>;
  useShadow?: boolean;
  shadow?: ShadowRootInit;
}

export abstract class Component<T = any> extends HTMLElement {
  shadow: ShadowRoot | null;
  render: RenderFn;
  private trackedStores: UnsubscribeStoreFn[];

  // specify the property on the element instance type
  _props: T & { children?: any };

  constructor(options?: ComponentOptions<T>) {
    super();
    this.trackedStores = [];
    const useShadow = options?.useShadow === undefined ? true : options?.useShadow;
    this.shadow = useShadow ? this.attachShadow(options?.shadow || { mode: "open" }) : null;
    const fn = this.init();
    const css = this.css();
    if (css) {
      this.shadow?.append(<style>{css}</style>);
    }

    this._props = options?.props as any;

    this.render = () => {
      let numInitialElements = css ? 1 : 0;
      if (this.shadow) while (this.shadow.children.length !== numInitialElements) this.shadow?.lastChild?.remove();
      fn();
    };
  }

  get props(): T & { children?: any } {
    return this._props;
  }

  set props(val: T & { children?: any }) {
    this._props = val || ({} as any);
    this.render();
  }

  /**
   * Registers a store we want to observe. Any changes made to the object will cause a render. If you do not want to render on all occassions you can filter when renders ocurr using the path parameter
   * @param store The store we want to observer
   * @param path [Optional] Path can be specified using dot notation to only render if the propety name matches. For example "foo.bar" will trigger a render for any change to fields of bar or beyond (foo.bar.baz = 1 or even foo.bar.baz.gar = 1)
   * @returns
   */
  observeStore<K extends object>(store: Store<K>, path?: string) {
    const [val, unsubscribe] = store.proxy(this, path);
    this.trackedStores.push(unsubscribe);
    return val;
  }

  css(): string | null {
    return null;
  }

  useState<T>(defaultValue: T): [() => T, (val: T) => void] {
    let value = defaultValue;

    const getValue = (): T => {
      return value;
    };
    const setValue = (newValue: T) => {
      if (newValue === value) return;
      value = newValue;
      this.render();
    };
    return [getValue, setValue];
  }

  abstract init(): RenderFn;

  // connect component
  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
    for (const soreUnsubscribeFn of this.trackedStores) soreUnsubscribeFn();
  }
}
