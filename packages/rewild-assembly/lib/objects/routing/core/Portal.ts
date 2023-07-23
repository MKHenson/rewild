import { Link } from "./Link";
import { Node } from "./Node";

export class Portal {
  node: Node | null;
  name: string;
  links: Link[];

  constructor(name: string, node: Node | null = null) {
    this.name = name;
    this.node = node;
    this.links = [];
  }
}

export function createPortal(name: string): Portal {
  return new Portal(name);
}
