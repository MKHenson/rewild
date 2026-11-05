import { SceneBVH } from 'rewild-renderer/lib/acceleration/SceneBVH';
import { BehaviourState, IAsset, IBehaviour } from 'rewild-routing';
import { Creature } from '../Creature';
import { Animator } from './Animator';

/**
 * Runs a creature each frame: movement first, then the animator, so the
 * ground speed it measures is this frame's step.
 */
export class CreatureBehaviour implements IBehaviour {
  name = 'creature';
  readonly animator: Animator;
  private readonly creature: Creature;
  private readonly sceneBVH: SceneBVH | null;

  constructor(creature: Creature, sceneBVH: SceneBVH | null) {
    this.creature = creature;
    this.animator = new Animator(creature.animator);
    this.sceneBVH = sceneBVH;
  }

  onMount(): void {
    this.animator.onMount();
  }

  onUpdate(delta: f32, total: u32, asset: IAsset): void {
    const { creature, sceneBVH } = this;
    const movement = creature.movement;
    if (movement && delta > 0) {
      movement.update(delta);
      movement.applyTo(creature.transform);
      creature.transform.updateWorldMatrix(false, false);
      creature.animator.climb = movement.climb;

      if (sceneBVH) {
        const meshes = creature.skinned.meshes;
        for (let i = 0; i < meshes.length; i++)
          sceneBVH.markObjectMoved(meshes[i].transform);
      }
    }
    this.animator.onUpdate(delta, total, asset);
  }

  serialize(): BehaviourState {
    return {
      movement: this.creature.movement?.serialize() ?? null,
      animator: this.animator.serialize(),
    };
  }

  restore(state: BehaviourState): void {
    const { movement, animator } = state;
    if (movement && typeof movement === 'object' && !Array.isArray(movement))
      this.creature.movement?.restore(movement);
    if (animator && typeof animator === 'object' && !Array.isArray(animator))
      this.animator.restore(animator);
  }
}
