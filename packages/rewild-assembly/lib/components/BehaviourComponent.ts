import { Component } from '../core/Component';

export class BehaviourComponent extends Component {
  constructor(name: string | null = null) {
    super(name);
  }

  onUpdate(delta: f32, total: u32): void {}
  mount(): void {}
  unMount(): void {}

  copy(source: BehaviourComponent): Component {
    return super.copy(source);
  }
}
