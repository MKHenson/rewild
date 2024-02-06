import { Link } from "./Link";
import { Node } from "./Node";

export class Portal {
  node: Node | null;
  name: string;
  links: Link[];
  disposed: boolean;

  constructor(name: string, node: Node | null = null) {
    this.name = name;
    this.node = node;
    this.links = [];
    this.disposed = false;
  }

  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    for (let i: i32 = 0, l: i32 = this.links.length; i < l; i++) {
      const link = unchecked(this.links[i]);
      const sourcePortal = link.sourcePortal;

      if (sourcePortal) {
        sourcePortal.links.splice(sourcePortal.links.indexOf(link), 1);
      }

      const destinationPortal = link.destinationPortal;

      if (destinationPortal) {
        destinationPortal.links.splice(
          destinationPortal.links.indexOf(link),
          1
        );
      }
    }

    this.node = null;
  }
}
