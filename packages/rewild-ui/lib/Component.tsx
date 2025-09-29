import { Callback, UnsubscribeStoreFn, RescribeStoreFn } from './Signaller';
import { Store } from './Store';

type RenderFn = () => void;
type InitFn = () => null | JSX.ChildElement | JSX.ChildElement[];

export function register<
  T extends CustomElementConstructor | JSX.ComponentStatic
>(tagName: string) {
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

export abstract class Component<T = any>
  extends HTMLElement
  implements JSX.Component
{
  shadow: ShadowRoot | null;
  render: RenderFn;
  private trackedUnsubscribes: UnsubscribeStoreFn[];
  private trackedSubscribes: RescribeStoreFn[];
  private mergedCss: CSSStyleSheet;

  onMount?: () => void;
  onCleanup?: () => void;

  // specify the property on the element instance type
  _props: T & JSX.PropsWithChildren & { css?: string };

  constructor(options?: ComponentOptions<T>) {
    super();
    this.trackedUnsubscribes = [];
    this.trackedSubscribes = [];
    const useShadow =
      options?.useShadow === undefined ? true : options?.useShadow;
    this.shadow = useShadow
      ? this.attachShadow(options?.shadow || { mode: 'open' })
      : null;
    this._props = options?.props as any;
  }

  protected mergeCss(curStyle: CSSStyleSheet, css: string) {
    let hybridCss = '';

    const rules = curStyle.cssRules;
    for (let i = 0, l = rules.length; i < l; i++) {
      hybridCss += rules[i].cssText + '\n';
    }

    hybridCss += '\n' + css;

    return cssStylesheet(hybridCss);
  }

  _createRenderer() {
    const parent = this.shadow ? this.shadow : this;
    this.render = () => {
      // Generates new DOM
      let children = fn();

      let existingChildren = parent.childNodes;
      const lenOfExistingChildren = existingChildren.length;

      if (children) {
        // Convert to array
        if (!Array.isArray(children)) children = [children];

        const curLengthChildren = children.length;

        // Remove children after the length index
        if (
          lenOfExistingChildren > curLengthChildren &&
          curLengthChildren > 0
        ) {
          for (let i = lenOfExistingChildren - 1; i > curLengthChildren; i--) {
            existingChildren[i].remove();
          }
        }

        for (let i = 0, l = curLengthChildren; i < l; i++) {
          // If the new node is exactly the same - skip it as we dont want to re-render
          if (
            i < lenOfExistingChildren &&
            children[i] === existingChildren[i]
          ) {
            continue;
          }
          // New node is not the same, and at the same position of an existing element. So replace existing elm with new one.
          else if (i < lenOfExistingChildren) {
            const childToReplace = parent.childNodes[i];
            parent.insertBefore(children[i] as Node, childToReplace);
            childToReplace.remove();
          } else parent.append(children[i] as Node);
        }
      } else {
        // If nothing returned, then clear existing elements
        while (parent.childNodes.length !== 0) {
          parent.lastChild!.remove();
        }
      }
    };

    const fn = this.init();
  }

  get props(): T & JSX.PropsWithChildren & { css?: string } {
    return this._props;
  }

  set props(val: T & JSX.PropsWithChildren & { css?: string }) {
    this._props = val || ({} as any);
    this.render();
  }

  /**
   * Registers a store we want to observe. Any changes made to the object will cause a render. If you do not want to render on all occassions you can filter when renders ocurr using the path parameter
   * @param store The store we want to observer
   * @param path [Optional] Path can be specified using dot notation to only render if the propety name matches. For example "foo.bar" will trigger a render for any change to fields of bar or beyond (foo.bar.baz = 1 or even foo.bar.baz.gar = 1)
   * @returns
   */
  observeStore<K extends object>(store: Store<K>, cb?: Callback<K>) {
    const [val, unsubscribe, rescribe] = store.createProxy(cb || this.render);
    this.trackedUnsubscribes.push(unsubscribe);
    this.trackedSubscribes.push(rescribe);
    return val;
  }

  getStyle(): string | CSSStyleSheet | null {
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

  /**
   * All components must implement this method. It must return a function that renders the component.
   */
  abstract init(): InitFn;

  generateCss() {
    const css = this.getStyle();
    if (!css) return;

    const cssIsStylesheetObj = !(typeof css === 'string');
    let stylesheed: CSSStyleSheet;

    if (!cssIsStylesheetObj) {
      stylesheed = new CSSStyleSheet();
      stylesheed.replaceSync(css);
    } else stylesheed = css;

    this.mergedCss = stylesheed;
    if (this.props.css) {
      this.mergedCss = this.mergeCss(stylesheed, this.props.css);
    }

    if (this.shadow) this.shadow.adoptedStyleSheets = [this.mergedCss];
    else if (!document.adoptedStyleSheets.includes(this.mergedCss))
      document.adoptedStyleSheets = document.adoptedStyleSheets.concat(
        this.mergedCss
      );
  }

  // connect component
  connectedCallback() {
    this.generateCss();
    this.render();
    this.onMount?.();
    for (const resubscribeFn of this.trackedSubscribes) resubscribeFn?.();
  }

  disconnectedCallback() {
    this.onCleanup?.();
    for (const unsubscribeFn of this.trackedUnsubscribes) unsubscribeFn();
  }
}
