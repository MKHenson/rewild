import { Dispatcher, Subscriber } from 'rewild-common';

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
  private trackedUnsubscribes: (() => void)[];
  private trackedSubscribes: (() => void)[];
  private mergedCss: CSSStyleSheet;

  private _renderScheduled = false;

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
      const focused = (
        this.shadow ? this.shadow.activeElement : document.activeElement
      ) as HTMLElement | null;

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
          for (let i = lenOfExistingChildren - 1; i >= curLengthChildren; i--) {
            try {
              existingChildren[i]?.remove();
            } catch (_) {}
          }
        }

        for (let i = 0, l = curLengthChildren; i < l; i++) {
          const existingChild = parent.childNodes[i];
          // If the new node is exactly the same - skip it as we dont want to re-render
          if (existingChild && children[i] === existingChild) {
            continue;
          }
          // New node is not the same, and at the same position of an existing element. So replace existing elm with new one.
          else if (existingChild) {
            parent.insertBefore(children[i] as Node, existingChild);
            try {
              existingChild.remove();
            } catch (_) {}
          } else parent.append(children[i] as Node);
        }
      } else {
        // If nothing returned, then clear existing elements
        while (parent.childNodes.length !== 0) {
          parent.lastChild!.remove();
        }
      }

      if (focused && parent.contains(focused)) focused.focus();
    };

    const fn = this.init();
  }

  get props(): T & JSX.PropsWithChildren & { css?: string } {
    return this._props;
  }

  set props(val: T & JSX.PropsWithChildren & { css?: string }) {
    this._props = val || ({} as any);
    this.render?.();
  }

  on<T>(dispatcher: Dispatcher<T>, handler: Subscriber<T> = this.render): void {
    dispatcher.add(handler);
    this.trackedUnsubscribes.push(() => dispatcher.remove(handler));
    this.trackedSubscribes.push(() => {
      if (!dispatcher.listeners.includes(handler)) dispatcher.add(handler);
    });
  }

  getStyle(): string | CSSStyleSheet | null {
    return null;
  }

  useState<S>(defaultValue: S): [() => S, (val: S, render?: boolean) => void] {
    let value = defaultValue;

    const getValue = (): S => {
      return value;
    };
    const setValue = (newValue: S, render = true) => {
      if (newValue === value) return;
      value = newValue;
      if (render && !this._renderScheduled) {
        this._renderScheduled = true;
        queueMicrotask(() => {
          this._renderScheduled = false;
          this.render();
        });
      }
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
    let stylesheet: CSSStyleSheet;

    if (!cssIsStylesheetObj) {
      stylesheet = new CSSStyleSheet();
      stylesheet.replaceSync(css);
    } else stylesheet = css;

    this.mergedCss = stylesheet;
    if (this.props?.css) {
      this.mergedCss = this.mergeCss(stylesheet, this.props.css);
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

    // Remove document-level stylesheets added by non-shadow components
    if (!this.shadow && this.mergedCss) {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (s) => s !== this.mergedCss
      );
    }
  }
}
