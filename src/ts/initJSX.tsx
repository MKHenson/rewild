function jsx<T extends JSX.Tag = JSX.Tag>(
  tag: T,
  attributes: { [key: string]: any } | null,
  ...children: Node[]
): JSX.Element;
function jsx(tag: JSX.Component, attributes: Parameters<typeof tag> | null, ...children: Node[]): Node;
function jsx(tag: JSX.ComponentStatic, attributes: Parameters<typeof tag> | null, ...children: Node[]): Node;
function jsx(
  tag: JSX.Tag | JSX.Component | JSX.ComponentStatic,
  attributes: { [key: string]: any } | null,
  ...children: Node[]
) {
  // Check if this is a web component
  if (typeof tag === "function" && (tag as JSX.ComponentStatic).tagName) {
    const element = document.createElement((tag as JSX.ComponentStatic).tagName!) as JSX.Element;
    element.props = { ...element.props, ...attributes };
    appendChildren(element, children);
    return element;
  }

  // Check if a functional component
  if (typeof tag === "function") {
    return tag(attributes ?? {}, children);
  }
  const element = document.createElement(tag);

  // Assign attributes:
  let map = attributes ?? {};
  let prop: keyof typeof map;
  for (prop of Object.keys(map) as any) {
    // Extract values:
    prop = prop.toString();
    const value = map[prop] as any;
    const anyReference = element as any;
    if (typeof anyReference[prop] === "undefined") {
      // As a fallback, attempt to set an attribute:
      element.setAttribute(prop, value);
    } else {
      anyReference[prop] = value;
    }
  }

  // append children
  appendChildren(element, children);
  return element;
}

function appendChildren(element: HTMLElement, children: Node[]) {
  // append children
  for (let child of children) {
    if (typeof child === "string") {
      element.innerText += child;
      continue;
    }
    if (Array.isArray(child)) {
      element.append(...child);
      continue;
    }

    if (child) element.appendChild(child);
  }
}

(window as any).jsx = jsx;
(window as any).css = (val: TemplateStringsArray, ...rest: (TemplateStringsArray | string)[]) => {
  let str = "";
  val.forEach((string, i) => (str += string + (rest[i] || "")));
  str = str.replace(/\r?\n|\r/g, "");
  return str;
};
