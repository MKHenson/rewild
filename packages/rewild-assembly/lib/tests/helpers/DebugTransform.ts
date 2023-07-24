import { TransformNode } from "../../core/TransformNode";
import { transformCallback } from "../Imports";

export class DebugTransform extends TransformNode {
  constructor(name: string) {
    super();
    this.name = name;
  }

  onAddedToParent(): void {
    super.onAddedToParent();
    transformCallback(this.name, "onAddedToParent", "");
  }

  onRemovedFromParent(): void {
    super.onRemovedFromParent();
    transformCallback(this.name, "onRemovedFromParent", "");
  }
}

export function createDebugTransform(name: string): TransformNode {
  return new DebugTransform(name);
}
