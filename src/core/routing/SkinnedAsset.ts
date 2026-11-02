import { ICreatureAnimation } from 'models';
import { SkinnedInstance } from 'rewild-renderer';
import { AnimationController } from '../animation/AnimationController';
import { Asset3D } from './Asset3D';

/** An asset drawn from a skinned model, with the controller that animates it. */
export class SkinnedAsset extends Asset3D {
  readonly skinned: SkinnedInstance;
  /** Behaviours tell it what they want. */
  readonly animator: AnimationController;

  constructor(skinned: SkinnedInstance, animation: ICreatureAnimation) {
    super(skinned.transform);
    this.skinned = skinned;
    this.animator = new AnimationController(skinned, animation);
    this.animator.start();
    skinned.transform.userData.skinned = skinned;
  }

  dispose(): void {
    this.skinned.dispose();
  }
}
