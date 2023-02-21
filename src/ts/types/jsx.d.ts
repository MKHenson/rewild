declare namespace JSX {
  // The return type of our JSX Factory
  type Element = HTMLElement;

  /** The child types we allow  */
  export type ChildElement = JSX.Element | number | boolean | undefined | null | string;

  // IntrinsicElements describes to TS what all the standard elements are supported.
  // For example things like <div> or <span>
  interface IntrinsicElements extends BaseIntrinsicElements {}

  /** Describes the name of the children prop to use in Class based JSX*/
  interface ElementChildrenAttribute {
    children: {};
  }

  type Tag = keyof JSX.IntrinsicElements;

  interface Component extends HTMLElement {
    (properties?: { [key: string]: any }, children?: ChildElement[]): Node;
    props: { [key: string]: any };
    _props: { [key: string]: any };
  }

  interface ComponentStatic {
    new (): Component;
    (properties?: { [key: string]: any }, children?: ChildElement[]): Node;
    tagName?: string;
  }
}

// Declare global css helper function for nice styling :)
declare function css(val: TemplateStringsArray, ...rest: (TemplateStringsArray | string | number)[]): string;
