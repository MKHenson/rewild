import { Component } from "../../core/Component";
import { Runtime } from "../../objects/routing";
import { componentCallback } from "../Imports";

export class DebugComponent extends Component {
  constructor(name: string) {
    super();
    this.name = name;
  }

  onUpdate(delta: f32, total: u32): void {
    super.onUpdate(delta, total);
    componentCallback(this.name!, "onUpdate", "");
  }

  mount(runtime: Runtime): void {
    super.mount(runtime);
    componentCallback(this.name!, "mount", "");
  }

  unMount(runtime: Runtime): void {
    super.unMount(runtime);
    componentCallback(this.name!, "unMount", "");
  }
}

export function createDebugComponent(name: string): Component {
  return new DebugComponent(name);
}
