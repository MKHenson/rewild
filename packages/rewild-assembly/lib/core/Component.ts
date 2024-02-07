import { EventDispatcher } from 'rewild-common';
import { addComponent, TransformNode } from './TransformNode';

export class Component extends EventDispatcher {
  transform: TransformNode | null;
  name: string | null;

  constructor(name: string | null = null) {
    super();
    this.name = name;
    this.transform = null;
  }

  onUpdate(delta: f32, total: u32): void {}
  mount(): void {}
  unMount(): void {}

  copy(source: Component): Component {
    if (source.transform) addComponent(source.transform, this);
    return this;
  }
}
