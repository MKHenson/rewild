import { Link } from "./Link";
import { Node } from "./Node";

export class Portal {
  node: Node;
  name: string;
  links: Link[];

  constructor(name: string, node: Node) {
    this.name = name;
    this.node = node;
    this.links = [];
  }
}
