import { BehaviourState, IBehaviour } from 'rewild-routing';
import { SchoolAsset } from '../SchoolAsset';

/** Steers a school each frame. */
export class SchoolBehaviour implements IBehaviour {
  name = 'school';

  constructor(private readonly asset: SchoolAsset) {}

  onUpdate(delta: f32): void {
    if (delta > 0) this.asset.update(delta);
  }

  serialize(): BehaviourState {
    return {};
  }

  restore(): void {}
}
