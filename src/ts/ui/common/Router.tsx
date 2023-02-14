import { Component, register } from "../Component";

const ROUTER_TYPES = {
    hash: "hash",
    history: "history",
  },
  defer = (x: () => void) => {
    setTimeout(() => x(), 10);
  };

interface Props {
  type?: "hash" | "history";
}

function createUrl(isHash: boolean, href: string) {
  if (isHash && href.startsWith("#")) {
    href = href.substr(1);
  }
  return new URL(href, document.location.origin);
}

export function navigate(path: string, isHash = false) {
  const url = createUrl(isHash, path);
  window.history.pushState({ path: path }, path, url.origin + url.pathname);
  window.dispatchEvent(new CustomEvent("history-pushed"));
}

/**
 * SPA Router - replacement for Framework Routers (history and hash).
 */
@register("x-router")
export class Router extends Component<Props> {
  constructor() {
    super({ props: { type: "history" }, shadow: { mode: "open" } });
  }

  init() {
    return () => {
      this.listen();
      this.shadow!.append(<slot></slot>);
    };
  }

  /**
   * Start listening for route changes.
   * @returns {VanillaRouter} reference to itself.
   */
  listen() {
    if (this.isHashRouter) {
      window.addEventListener("hashchange", this.hashChanged.bind(this));
      defer(() => this.tryNav(document.location.hash.substr(1)));
    } else {
      let href = document.location.origin;
      href += document.location.pathname;

      document.addEventListener("click", this.onNavClick.bind(this));
      defer(() => this.tryNav(href));
    }
    return this;
  }

  private hashChanged() {
    this.tryNav(document.location.hash.substr(1));
  }

  private findRoute(url: string) {
    const test =
      "/" +
      url
        .match(/([A-Za-z_0-9.]*)/gm)
        ?.filter((u) => !!u)
        .join("/");
    return test;
  }

  private tryNav(href: string) {
    const url = createUrl(this.isHashRouter, href);
    if (url.protocol.startsWith("http")) {
      const routePath = this.findRoute(url.pathname);
      if (routePath) {
        if (this.props.type === "history") {
          window.history.pushState({ path: routePath }, routePath, url.origin + url.pathname);
          window.dispatchEvent(new CustomEvent("history-pushed"));
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Prevents a click and instead pushes a router change
   */
  private onNavClick(e: MouseEvent) {
    const element = e.composedPath().at(0) as HTMLElement;
    const href = (element.closest("[href]") as HTMLAnchorElement)?.href;
    if (href && this.tryNav(href)) {
      e.preventDefault();
    }
  }

  get isHashRouter() {
    return this.props.type === ROUTER_TYPES.hash;
  }
}
