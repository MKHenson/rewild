import { Component, register } from "../Component";

interface Props {
  path: string;
  exact?: boolean;
  onRender: (params: any) => JSX.Element;
}

@register("x-route")
export class Route extends Component<Props> {
  constructor() {
    super({ props: { exact: false }, useShadow: false });
  }

  init() {
    return () => this.props.children;
  }

  clear() {
    while (this.lastChild) this.lastChild.remove();
  }
}
