type RenderFn = () => void;

export function register<T extends CustomElementConstructor | JSX.ComponentStatic>(tagName: string) {
  return <U extends T>(constructor: U) => {
    // register component
    customElements.define(tagName, constructor as CustomElementConstructor);

    (constructor as JSX.ComponentStatic).tagName = tagName;
  };
}

export abstract class Component<T = any> extends HTMLElement {
  shadow: ShadowRoot;
  render: RenderFn;

  // specify the property on the element instance type
  _props: T;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "closed" });
    this.render = this.init();
  }

  get props() {
    return this._props;
  }
  set props(val: T) {
    this._props = val;
    this.render();
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

  disconnectedCallback() {}
}
