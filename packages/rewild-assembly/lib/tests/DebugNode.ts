import { Node } from "../objects/routing/core/Node";
import { Portal } from "../objects/routing/core/Portal";
import { nodeCallback } from "./Imports";

export class DebugNode extends Node {
  constructor(name: string) {
    super(name);
  }

  mount(): void {
    super.mount();
    nodeCallback(this.name, "mount", "");
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

export function createDebugNode(name: string): Node {
  return new DebugNode(name);
}
