import { Component, register } from "../Component";

interface Props {
  path: string;
  exact?: boolean;
  onRender: (params: any) => JSX.Element;
}

@register("x-route")
export class Route extends Component<Props> {
  constructor() {
    super({ props: { exact: false }, shadow: { mode: "open" } });
  }

  init() {
    return () => {
      this.shadow?.append(<slot></slot>);
    };
  }

  clear() {
    const elements = this.shadow!.querySelector("slot")!.assignedElements();
    for (const elm of elements) elm.remove();
  }
}
