import { TransformNode } from "../../core/TransformNode";
import { Container, Node, Portal } from "../../objects/routing";
import { nodeCallback } from "../Imports";

export class DebugContainer extends Container {
  constructor(name: string, activeOnStartup: boolean, autoDispose: boolean) {
    super(name, activeOnStartup, autoDispose);
  }

  mount(): void {
    nodeCallback(this.name, "mount", "");
    super.mount();
  }

  addAsset(object: TransformNode): void {
    nodeCallback(this.name, "addAsset", object.name);
    super.addAsset(object);
  }

  unMount(): void {
    nodeCallback(this.name, "unMount", "");
    super.unMount();
  }

  onUpdate(delta: f32, total: u32): void {
    nodeCallback(this.name, "onUpdate", "");
    super.onUpdate(delta, total);
  }

  enter(portalEntered: Portal): void {
    nodeCallback(this.name, "enter", portalEntered.name);
    super.enter(portalEntered);
  }
}

export function createDebugContainer(
  name: string,
  activeOnStartup: boolean,
  autoDispose: boolean
): Node {
  return new DebugContainer(name, activeOnStartup, autoDispose);
}
