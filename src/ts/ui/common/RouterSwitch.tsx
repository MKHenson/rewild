import { Component, register } from "../Component";
import { Route } from "./Route";

interface Props {}

@register("x-router-switch")
export class RouterSwitch extends Component<Props> {
  triggerPopStateDelegate: (e: Event) => void;

  constructor() {
    super({ shadow: { mode: "open" } });
    this.triggerPopStateDelegate = this.triggerPopState.bind(this);
  }

  init() {
    return () => {
      this.shadow?.append(<slot></slot>);
    };
  }

  isMatch(exact: boolean, locationParts: string[], routeParts: string[]) {
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

  renderRoute() {
    const path = window.location.pathname;
    const routes = this.shadow!.querySelector("slot")!.assignedElements() as Route[];
    const locationParts = path.split("/");

    for (const route of routes) {
      if (route.parentNode) route.clear();

      const routeParts = route._props.path.split("/");
      const isMatch = this.isMatch(route._props.exact!, locationParts, routeParts);

      if (isMatch) {
        const params = routeParts.reduce((prev, cur, index) => {
          if (cur.charAt(0) === ":") prev[cur.substring(1, cur.length)] = locationParts[index];

          return prev;
        }, {} as { [id: string]: string });

        route.append(route.props.onRender(params));
      }
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("history-pushed", this.triggerPopStateDelegate);
    this.renderRoute();
  }

  disconnectedCallback(): void {
    const routes = this.shadow!.querySelector("slot")!.assignedElements() as Route[];
    for (const route of routes) if (route.parentNode) route.clear();

    super.disconnectedCallback();
    window.removeEventListener("history-pushed", this.triggerPopStateDelegate);
  }

  triggerPopState(e: Event): void {
    this.renderRoute();
  }
}
