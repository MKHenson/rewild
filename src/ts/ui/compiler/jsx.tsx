function jsx<T extends JSX.Tag = JSX.Tag>(
  tag: T,
  attributes: { [key: string]: any } | null,
  ...children: JSX.ChildElement[]
): JSX.Element;
function jsx(
  tag: JSX.Component,
  attributes: Parameters<typeof tag> | null,
  ...children: JSX.ChildElement[]
): Node;
function jsx(
  tag: JSX.ComponentStatic,
  attributes: Parameters<typeof tag> | null,
  ...children: JSX.ChildElement[]
): Node;
function jsx(
  tag: JSX.Tag | JSX.Component | JSX.ComponentStatic,
  attributes: { [key: string]: any } | null,
  ...children: JSX.ChildElement[]
) {
  // Check if this is a web component
  if (typeof tag === "function" && (tag as JSX.ComponentStatic).tagName) {
    const element = document.createElement(
      (tag as JSX.ComponentStatic).tagName!
    ) as JSX.Element;
    (element as any)._props = { ...element.props, ...attributes, children };
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

function appendChildren(element: HTMLElement, children: JSX.ChildElement[]) {
  // append children
  for (let child of children) {
    if (child === undefined || child === null || child === "") continue;

    if (
      typeof child === "string" ||
      typeof child === "number" ||
      typeof child === "boolean"
    ) {
      element.innerText += child;
      continue;
    }

    if (Array.isArray(child)) {
      appendChildren(element, child);
      continue;
    }

    if (child) {
      element.appendChild(child);
    }
  }
}

(window as any).jsx = jsx;
(window as any).css = (
  val: TemplateStringsArray,
  ...rest: (TemplateStringsArray | string)[]
) => {
  let str = "";
  val.forEach((string, i) => (str += string + (rest[i] || "")));
  str = str.replace(/\r?\n|\r/g, "");
  return str;
};
