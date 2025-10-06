import { IBehaviour } from 'node_modules/rewild-routing';
import { Spin } from './behaviours/Spin';

export class BehaviourManager {
  private behaviours: IBehaviour[];

  constructor() {
    this.behaviours = [new Spin()];
  }

  add(behaviour: IBehaviour): void {
    if (!this.behaviours.includes(behaviour)) {
      this.behaviours.push(behaviour);
    }
  }

  remove(behaviour: IBehaviour): void {
    const index = this.behaviours.indexOf(behaviour);
    if (index > -1) {
      this.behaviours.splice(index, 1);
    }
  }

  findByName(name: string): IBehaviour | null {
    return this.behaviours.find((b) => b.name === name) || null;
  }
}

export const behaviourManager = new BehaviourManager();
