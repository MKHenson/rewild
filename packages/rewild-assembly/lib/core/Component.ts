import { EventDispatcher } from "rewild-common";
import { addComponent, TransformNode } from "./TransformNode";
import { Runtime } from "../objects/routing";

export class Component extends EventDispatcher {
  transform: TransformNode | null;
  name: string | null;

  constructor(name: string | null = null) {
    super();
    this.name = name;
    this.transform = null;
  }

  onUpdate(delta: f32, total: u32): void {}

  mount(runtime: Runtime): void {}

  unMount(runtime: Runtime): void {}

  copy(source: Component): Component {
    if (source.transform) addComponent(source.transform, this);
    return this;
  }
}

export function onComponentUpdate(
  component: Component,
  delta: f32,
  total: u32
): void {
  component.onUpdate(delta, total);
}

export function componentMount(component: Component, runtime: Runtime): void {
  component.mount(runtime);
}

export function componentUnMount(component: Component, runtime: Runtime): void {
  component.unMount(runtime);
}
