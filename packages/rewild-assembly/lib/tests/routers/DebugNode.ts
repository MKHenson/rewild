import { Node } from "../../objects/routing/core/Node";
import { Portal } from "../../objects/routing/core/Portal";
import { nodeCallback } from "../Imports";

export class DebugNode extends Node {
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
}

export function createDebugNode(name: string, autoDispose: boolean): Node {
  return new DebugNode(name, autoDispose);
}