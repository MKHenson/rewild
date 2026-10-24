import { BehaviourState, IAsset, IBehaviour } from 'rewild-routing';
import { AnimationController } from '../../animation/AnimationController';
import { Asset3D } from '../Asset3D';

/** Seconds the measured ground speed takes to settle, so jitter cannot pop the blend. */
export const SPEED_SMOOTHING = 0.15;

/**
 * Runs a creature's animation controller each frame, with the ground speed
 * measured from how far the asset moved.
 */
export class Animator implements IBehaviour {
  name = 'animator';
  readonly controller: AnimationController;

  private lastX = 0;
  private lastZ = 0;
  private placed = false;

  constructor(controller: AnimationController) {
    this.controller = controller;
  }

  onMount(): void {
    this.placed = false;
    this.controller.speed = 0;
  }

  onUpdate(delta: f32, _total: u32, asset: IAsset): void {
    if (asset instanceof Asset3D && delta > 0) {
      const m = asset.transform.matrixWorld.elements;
      const x = m[12];
      const z = m[14];

      if (this.placed) {
        const measured = Math.hypot(x - this.lastX, z - this.lastZ) / delta;
        const t = 1 - Math.exp(-delta / SPEED_SMOOTHING);
        this.controller.speed += (measured - this.controller.speed) * t;
      }

      this.lastX = x;
      this.lastZ = z;
      this.placed = true;
    }

    this.controller.update(delta);
  }

  serialize(): BehaviourState {
    return { locomotion: this.controller.locomotionSet };
  }

  restore(state: BehaviourState): void {
    if (typeof state.locomotion === 'string')
      this.controller.setLocomotion(state.locomotion, 0);
  }
}
