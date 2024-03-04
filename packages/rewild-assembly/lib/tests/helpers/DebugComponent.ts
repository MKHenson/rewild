import { BehaviourComponent } from '../../components/BehaviourComponent';
import { Component } from '../../core/Component';
import { componentCallback } from '../Imports';

export class DebugComponent extends BehaviourComponent {
  constructor(name: string) {
    super();
    this.name = name;
  }

  onUpdate(delta: f32, total: u32): void {
    super.onUpdate(delta, total);
    componentCallback(this.name!, 'onUpdate', '');
  }

  mount(): void {
    super.mount();
    componentCallback(this.name!, 'mount', '');
  }

  unMount(): void {
    super.unMount();
    componentCallback(this.name!, 'unMount', '');
  }
}

export function createDebugComponent(name: string): Component {
  return new DebugComponent(name);
}
