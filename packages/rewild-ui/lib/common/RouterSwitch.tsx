import { Component, register } from "../Component";
import { Route } from "./Route";

interface Props {}

@register("x-router-switch")
export class RouterSwitch extends Component<Props> {
  triggerPopStateDelegate: (e: Event) => void;
  private activeRoute: Route | null = null;
  private activeParams = '';

  constructor() {
    super({ useShadow: false });
    this.triggerPopStateDelegate = this.triggerPopState.bind(this);
  }

  init() {
    return () => {
      return this.props.children;
    };
  }

  private isMatch(exact: boolean, locationParts: string[], routeParts: string[]) {
    if (exact) {
      if (locationParts.length !== routeParts.length) {
        return false;
      }

      for (let i = 0; i < routeParts.length; i++) {
        if (locationParts[i] !== routeParts[i] && routeParts[i].charAt(0) !== ":") {
          return false;
        }
      }

      return true;
    } else {
      for (let i = 0; i < routeParts.length; i++) {
        if (locationParts[i] !== routeParts[i] && routeParts[i].charAt(0) !== ":") {
          return false;
        }
      }

      return true;
    }
  }

  private renderRoute() {
    const path = window.location.pathname;
    const routes = Array.from(this.children).filter((child) => child instanceof Route) as Route[];
    const locationParts = path.split("/");

    let match: Route | null = null;
    let params: { [id: string]: string } = {};

    for (const route of routes) {
      const routeParts = route._props.path.split("/");
      if (!this.isMatch(route._props.exact!, locationParts, routeParts)) continue;

      match = route;
      params = routeParts.reduce((prev, cur, index) => {
        if (cur.charAt(0) === ":") prev[cur.substring(1, cur.length)] = locationParts[index];

        return prev;
      }, {} as { [id: string]: string });
      break;
    }

    // A route that still matches with the same params stays mounted, so nested
    // RouterSwitches can handle deeper paths without their parent rebuilding.
    const paramsKey = JSON.stringify(params);
    if (match && match === this.activeRoute && paramsKey === this.activeParams) return;

    for (const route of routes) {
      if (route.parentNode) route.clear();
      route.toggleAttribute("active", route === match);
    }

    this.activeRoute = match;
    this.activeParams = paramsKey;
    if (match) match.append(match.props.onRender(params));
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("history-pushed", this.triggerPopStateDelegate);
    this.renderRoute();
  }

  disconnectedCallback(): void {
    const routes = Array.from(this.children).filter((child) => child instanceof Route) as Route[];
    for (const route of routes) if (route.parentNode) route.clear();
    this.activeRoute = null;

    super.disconnectedCallback();
    window.removeEventListener("history-pushed", this.triggerPopStateDelegate);
  }

  private triggerPopState(e: Event): void {
    this.renderRoute();
  }
}
