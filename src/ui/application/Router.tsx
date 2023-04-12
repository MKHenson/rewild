import EventDispatcher, { DispatchableEvent } from "../../core/EventDispatcher";

export class RouterEvent extends DispatchableEvent {
  route: string;
  path: string;
  url: string | URL;

  constructor() {
    super("ROUTER__CHANGE");
  }
}
const routerEvent: RouterEvent = new RouterEvent();

const ROUTER_TYPES = {
    hash: "hash",
    history: "history",
  },
  defer = (x: () => void) => {
    setTimeout(() => x(), 10);
  };

type Options = {
  type?: "hash" | "history";
  routes: { [id: string]: string };
};

/**
 * SPA Router - replacement for Framework Routers (history and hash).
 */
export class Router extends EventDispatcher {
  options: Options;
  routeHash: string[];

  constructor(options: Options = { type: "hash", routes: {} }) {
    super();
    this.options = { ...options };
  }

  /**
   * Start listening for route changes.
   * @returns {VanillaRouter} reference to itself.
   */
  listen() {
    this.routeHash = Object.keys(this.options.routes);

    if (!this.routeHash.includes("/")) throw TypeError("No home route found");

    if (this.isHashRouter) {
      window.addEventListener("hashchange", this.hashChanged.bind(this));
      defer(() => this.tryNav(document.location.hash.substr(1)));
    } else {
      let href = document.location.origin;
      if (this.findRoute(document.location.pathname)) {
        href += document.location.pathname;
      }
      document.addEventListener("click", this.onNavClick.bind(this));
      window.addEventListener("popstate", this.triggerPopState.bind(this));

      defer(() => this.tryNav(href));
    }
    return this;
  }

  private hashChanged() {
    this.tryNav(document.location.hash.substr(1));
  }

  private triggerPopState(e: PopStateEvent) {
    this.triggerRouteChange(e.state.path, (e.target as Window)?.location.href);
  }

  private triggerRouteChange(path: string, url: string | URL) {
    routerEvent.path = path;
    routerEvent.url = url;
    routerEvent.route = this.options.routes[path];

    this.dispatchEvent(routerEvent);
  }

  private findRoute(url: string) {
    const test =
      "/" +
      url
        .match(/([A-Za-z_0-9.]*)/gm)
        ?.filter((u) => !!u)
        .join("/");
    return this.routeHash.includes(test) ? test : null;
  }

  private tryNav(href: string) {
    const url = this.createUrl(href);
    if (url.protocol.startsWith("http")) {
      const routePath = this.findRoute(url.pathname);
      if (routePath && this.options.routes[routePath]) {
        if (this.options.type === "history") {
          window.history.pushState({ path: routePath }, routePath, url.origin + url.pathname);
          window.dispatchEvent(new CustomEvent("history-pushed"));
        }
        this.triggerRouteChange(routePath, url);
        return true;
      }
    }

    return false;
  }

  private createUrl(href: string) {
    if (this.isHashRouter && href.startsWith("#")) {
      href = href.substr(1);
    }
    return new URL(href, document.location.origin);
  }

  /**
   * Prevents a click and instead pushes a router change
   */
  private onNavClick(e: MouseEvent) {
    const element = e.target as HTMLElement;
    const href = (element.closest("[href]") as HTMLAnchorElement)?.href;
    if (href && this.tryNav(href)) {
      e.preventDefault();
    }
  }

  /**
   * Makes the router navigate to the given route
   * @param {String} path
   */
  setRoute(path: string) {
    if (!this.findRoute(path)) throw TypeError("Invalid route");

    let href = this.isHashRouter ? "#" + path : document.location.origin + path;
    history.replaceState(null, "", href);
    this.tryNav(href);
  }

  get isHashRouter() {
    return this.options.type === ROUTER_TYPES.hash;
  }
}
