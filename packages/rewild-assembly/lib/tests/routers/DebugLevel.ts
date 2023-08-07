import { Level } from "../../objects/routing";
import { Node } from "../../objects/routing/core/Node";
import { Portal } from "../../objects/routing/core/Portal";
import { nodeCallback } from "../Imports";

export class DebugLevel extends Level {
  constructor(name: string, autoDispose: boolean) {
    super(name, autoDispose);
  }

  mount(): void {
    nodeCallback(this.name, "mount", "");
    super.mount();
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

  addChild(node: Node): Node {
    nodeCallback(this.name, "addChild", node.name);
    const result = super.addChild(node);
    return result;
  }
}

export function createDebugLevel(name: string, autoDispose: boolean): Node {
  return new DebugLevel(name, autoDispose);
}
