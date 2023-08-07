import { Node } from "./Node";
import { Portal } from "./Portal";
import { Container } from "./Container";
import { Link } from "./Link";

export class Level extends Node {
  constructor(name: string, autoDispose: boolean = false) {
    super(name, autoDispose);

    this.portals.push(new Portal("Enter", this));
    this.portals.push(new Portal("Exit", this));
  }

  onUpdate(delta: f32, total: u32): void {
    super.onUpdate(delta, total);
  }

  mount(): void {
    super.mount();

    // Activate the enter portal
    this.runtime!.sendSignal(this.getPortal("Enter")!, false);
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
        exitLink.connect(container.getPortal("Exit")!, this.getPortal("Exit")!);
      }
    }

    return super.addChild(node);
  }

  /** When an exit portal is trigged for a level, it will signal to the runtime to exit */
  enter(portalEntered: Portal): void {
    super.enter(portalEntered);

    // Activate the exit portal
    if (portalEntered.name == "Exit")
      this.runtime!.sendSignal(this.getPortal("Exit")!, true);
  }
}

export function createLevel(name: string): Node {
  return new Level(name);
}
