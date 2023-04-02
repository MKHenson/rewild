function jsx<T extends JSX.Tag = JSX.Tag>(
  tag: T,
  attributes: { [key: string]: any } | null,
  ...children: JSX.ChildElement[]
): JSX.Element;
function jsx(tag: JSX.FC<any>, attributes: Parameters<typeof tag> | null, ...children: JSX.ChildElement[]): Node;
function jsx(tag: JSX.Component, attributes: { [key: string]: any } | null, ...children: JSX.ChildElement[]): Node;
function jsx(
  tag: JSX.Tag | JSX.Component | JSX.FC<any>,
  attributes: { [key: string]: any } | null,
  ...children: JSX.ChildElement[]
) {
  // Check if this is a web component
  if (typeof tag === "function" && (tag as unknown as JSX.ComponentStatic).tagName) {
    const element = document.createElement((tag as unknown as JSX.ComponentStatic).tagName!) as JSX.Component;
    element._props = { ...element._props, ...attributes, children };
    element._createRenderer();
    appendChildren(element, children);
    return element;
  }

  // Check if a functional component
  if (typeof tag === "function") {
    return (tag as JSX.FC<any>)({ ...attributes, children: children });
  }

  const isSVGElm = svgTags.includes(tag.toString());
  const element = isSVGElm
    ? document.createElementNS("http://www.w3.org/2000/svg", tag.toString())
    : document.createElement(tag as JSX.Tag);

  // Assign attributes:
  let map = attributes ?? {};
  let prop: keyof typeof map;
  for (prop of Object.keys(map) as any) {
    // Extract values:
    prop = prop.toString();
    const value = map[prop] as any;
    const anyReference = element as any;
    if (typeof anyReference[prop] === "undefined" || isSVGElm) {
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

function appendChildren(element: HTMLElement | SVGElement, children: JSX.ChildElement[]) {
  // append children
  for (let child of children) {
    if (child === undefined || child === null || child === "") continue;

    if (typeof child === "string" || typeof child === "number" || typeof child === "boolean") {
      if (typeof child === "boolean" && !child) continue;

      if (element instanceof SVGElement) continue;

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
(window as any).css = (val: TemplateStringsArray, ...rest: (TemplateStringsArray | string)[]) => {
  let str = "";
  val.forEach((string, i) => (str += string + (rest[i] || "")));
  str = str.replace(/\r?\n|\r/g, "");
  return str;
};

(window as any).cssStylesheet = (val: string, addToDom?: boolean) => {
  const stylesheet = new CSSStyleSheet();
  stylesheet.replaceSync(val);

  if (addToDom) document.adoptedStyleSheets.push(stylesheet);
  return stylesheet;
};

const svgTags = [
  "a",
  "altGlyph",
  "altGlyphDef",
  "altGlyphItem",
  "animate",
  "animateMotion",
  "animateTransform",
  "circle",
  "clipPath",
  "cursor",
  "defs",
  "desc",
  "discard",
  "ellipse",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "filter",
  "font-face-format",
  "font-face-name",
  "font-face-src",
  "font-face-uri",
  "font-face",
  "font",
  "foreignObject",
  "g",
  "glyph",
  "glyphRef",
  "hkern",
  "image",
  "line",
  "linearGradient",
  "marker",
  "mask",
  "metadata",
  "missing-glyph",
  "mpath",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "script",
  "set",
  "stop",
  "style",
  "svg",
  "switch",
  "symbol",
  "text",
  "textPath",
  "title",
  "tref",
  "tspan",
  "use",
  "view",
  "vkern",
];
