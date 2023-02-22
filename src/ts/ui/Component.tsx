import { Store, UnsubscribeStoreFn } from "./Store";

type RenderFn = () => void;
type InitFn = () => null | ChildType | ChildType[];

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

export type ChildType = Node | Element | string | undefined;
type Effect = { cb: () => void; deps: any[] };
export abstract class Component<T = any> extends HTMLElement {
  shadow: ShadowRoot | null;
  render: RenderFn;
  private trackedStores: UnsubscribeStoreFn[];
  private effects: Effect[];
  domStyle: HTMLElement;

  // specify the property on the element instance type
  _props: T & { children?: ChildType | ChildType[] };

  constructor(options?: ComponentOptions<T>) {
    super();
    this.effects = [];
    this.trackedStores = [];
    const useShadow = options?.useShadow === undefined ? true : options?.useShadow;
    this.shadow = useShadow ? this.attachShadow(options?.shadow || { mode: "open" }) : null;
    const parent = useShadow ? this.shadow! : this;

    const fn = this.init();
    this._props = options?.props as any;

    this.render = () => {
      let prevEffects = this.effects.slice(0);
      if (this.effects.length) {
        this.effects = [];
      }

      const css = this.getStyle();

      // Generates new DOM
      let children = fn();

      if (this.effects.length) {
        let curDeps: any[], prevDeps: any[];
        let curEffect: Effect, prevEffect: Effect;
        for (let i = 0, l = this.effects.length; i < l; i++) {
          curEffect = this.effects[i];
          prevEffect = prevEffects[i];

          if (!prevEffect) continue;

          curDeps = curEffect.deps;
          prevDeps = prevEffect.deps;

          for (let ii = 0, il = curDeps.length; ii < il; ii++) {
            if (curDeps[ii] !== prevDeps[ii]) {
              curEffect.cb();
              break;
            }
          }
        }
      }

      let existingChildren = parent.children;
      const styleOffset = css ? 1 : 0;
      const lenOfExistingChildren = existingChildren.length - styleOffset;

      if (css) {
        if (parent.firstChild) {
          const prevStyle = parent.firstChild;
          parent.insertBefore(<style>{css}</style>, prevStyle);
          prevStyle.remove();
        } else parent.append(<style>{css}</style>);
      }

      if (children) {
        // Convert to array
        if (!Array.isArray(children)) children = [children];

        for (let i = 0, l = children.length; i < l; i++) {
          // If the new node is exactly the same - skip it as we dont want to re-render
          if (i < lenOfExistingChildren && children[i] === existingChildren[i + styleOffset]) {
            continue;
          }
          // New node is not the same, and at the same position of an existing element. So replace existing elm with new one.
          else if (i < lenOfExistingChildren) {
            const childToReplace = parent.children[i + styleOffset];
            parent.insertBefore(children[i] as Node, childToReplace);
            childToReplace.remove();
          } else parent.append(children[i] as Node);
        }
      } else {
        // If nothing returned, then clear existing elements
        while (parent.children.length !== (css ? 1 : 0)) {
          parent.lastChild!.remove();
        }
      }
    };
  }

  get props(): T & { children?: ChildType | ChildType[] } {
    return this._props;
  }

  set props(val: T & { children?: ChildType | ChildType[] }) {
    this._props = val || ({} as any);
    this.render();
  }

  addChildren(parent: Element, children?: ChildType | ChildType[]) {
    if (children) {
      if (Array.isArray(children)) {
        for (const child of children) if (child) parent.append(child);
      } else {
        parent.append(children as Node);
      }
    }
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

  getStyle(): string | null {
    return null;
  }

  useState<T>(defaultValue: T): [() => T, (val: T, render?: boolean) => void] {
    let value = defaultValue;

    const getValue = (): T => {
      return value;
    };
    const setValue = (newValue: T, render = true) => {
      if (newValue === value) return;
      value = newValue;
      if (render) this.render();
    };
    return [getValue, setValue];
  }

  useEffect(cb: () => void, deps: any[]) {
    this.effects.push({ cb, deps });
  }

  abstract init(): InitFn;

  // connect component
  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
    for (const soreUnsubscribeFn of this.trackedStores) soreUnsubscribeFn();
  }
}
