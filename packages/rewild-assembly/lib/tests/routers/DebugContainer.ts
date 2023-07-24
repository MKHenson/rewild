import { TransformNode } from "../../core/TransformNode";
import { Container, Node, Portal } from "../../objects/routing";
import { nodeCallback } from "../Imports";

export class DebugContainer extends Container {
  constructor(name: string, activeOnStartup: boolean, autoDispose: boolean) {
    super(name, activeOnStartup, autoDispose);
  }

  mount(): void {
    super.mount();
    nodeCallback(this.name, "mount", "");
  }

  addAsset(object: TransformNode): void {
    super.addAsset(object);
    nodeCallback(this.name, "addAsset", object.name);
  }

  unMount(): void {
    super.unMount();
    nodeCallback(this.name, "unMount", "");
  }

  onUpdate(delta: f32, total: u32): void {
    super.onUpdate(delta, total);
    nodeCallback(this.name, "onUpdate", "");
  }

  enter(portalEntered: Portal): void {
    super.enter(portalEntered);
    nodeCallback(this.name, "enter", portalEntered.name);
  }

  exit(exitPortal: Portal, turnOff: boolean): void {
    super.exit(exitPortal, turnOff);
    nodeCallback(this.name, "exit", exitPortal.name);
  }
}

export function createDebugContainer(
  name: string,
  activeOnStartup: boolean,
  autoDispose: boolean
): Node {
  return new DebugContainer(name, activeOnStartup, autoDispose);
}
