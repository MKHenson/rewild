import { EventDispatcher } from "./EventDispatcher";
import { addComponent, TransformNode } from "./TransformNode";

export class Component extends EventDispatcher {
  transform: TransformNode | null;

  constructor() {
    super();
  }

  onUpdate(delta: f32, total: u32): void {}

  copy(source: Component): Component {
    if (source.transform) addComponent(source.transform, this);
    return this;
  }
}
