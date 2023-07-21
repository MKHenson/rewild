import { Node } from "./Node";
import { Portal } from "./Portal";
import { Container } from "./Container";
import { Link } from "./Link";

export class Level extends Node {
  constructor(name: string) {
    super(name);

    this.portals.push(new Portal("Enter", this));
    this.portals.push(new Portal("Exit", this));
  }

  onUpdate(delta: f32, total: u32): void {
    super.onUpdate(delta, total);
  }

  addChild(node: Node): Node {
    if (node instanceof Container) {
      const container = node as Container;
      if (container.activeOnStartup) {
        const entranceLink = new Link();
        const exitLink = new Link();
        entranceLink.connect(
          this.getPortal("Enter")!,
          container.getPortal("Enter")!
        );
        exitLink.connect(
          container.getPortal("Exit")!,
          this.getPortal("Enter")!
        );
      }
    }

    return super.addChild(node);
  }
}

export function createLevel(name: string): Node {
  return new Level(name);
}
