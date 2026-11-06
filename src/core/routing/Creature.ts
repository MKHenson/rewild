import { Vector3 } from 'rewild-common';
import { ICreatureAnimation } from 'models';
import {
  SkinnedInstance,
  WaterQuerySample,
  getWaterTypeIndex,
  resolveClimatePreset,
} from 'rewild-renderer';
import { StateMachine } from 'rewild-routing';
import { CreaturePreset } from '../creatures/CreaturePresets';
import { CreatureWorld, createHabitat } from '../creatures/Habitat';
import { HeadLook } from '../creatures/HeadLook';
import { IMovementMode, MovementSystem } from '../creatures/MovementSystem';
import { Seek } from '../creatures/modes/Seek';
import { Wander } from '../creatures/modes/Wander';
import { SkinnedAsset } from './SkinnedAsset';
import { StateMachineData } from './Types';

/**
 * A skinned asset that moves on its own. In game it reads the world from the
 * state machine on mount and builds its movement system. In the editor it
 * only plays idle.
 */
export class Creature extends SkinnedAsset {
  readonly preset: CreaturePreset;
  movement: MovementSystem | null = null;
  headLook: HeadLook | null = null;

  private readonly hasLookChain: boolean;

  constructor(
    skinned: SkinnedInstance,
    animation: ICreatureAnimation,
    preset: CreaturePreset
  ) {
    super(skinned, animation);
    this.preset = preset;

    const chain = animation.bones?.lookAt;
    this.hasLookChain = !!chain && !!preset.lookAt;
    if (chain && preset.lookAt) skinned.setLookChain(chain);
  }

  mount(): void {
    super.mount();
    const sm = this.stateMachine as StateMachine<StateMachineData> | null;
    const data = sm?.data;
    if (!data?.gameManager) return;

    if (!this.movement) {
      const world = this.createWorld(data);
      this.movement = this.createMovement(world);
      if (this.hasLookChain)
        this.headLook = new HeadLook(
          this.preset.lookAt!,
          this.skinned,
          this.transform,
          world
        );
    }
    this.movement.placeAt(this.initialPosition, this.initialRotation);
  }

  private createWorld(data: StateMachineData): CreatureWorld {
    const terrain = data.renderer.terrainRenderer;
    const player = data.player;
    return {
      sampleHeight: (x, z) => terrain.sampleHeight(x, z),
      sampleWater: (x, z, out: WaterQuerySample) =>
        terrain.waterQuery.sample(x, z, out),
      waterTypeIndex: (name) =>
        getWaterTypeIndex(resolveClimatePreset(terrain.climatePreset), name),
      playerPosition: (out: Vector3) => {
        if (!player?.asset) return false;
        out.copy(player.asset.transform.position);
        return true;
      },
    };
  }

  private createMovement(world: CreatureWorld): MovementSystem {
    const { movement, habitat } = this.preset;
    const radius = this.buildObjectFromProperties()?.radius;
    const modes: IMovementMode[] = [];
    if (movement.modes.evade)
      modes.push(new Seek('evade', movement.modes.evade, true));
    if (movement.modes.seek)
      modes.push(new Seek('seek', movement.modes.seek, false));
    if (movement.modes.wander)
      modes.push(
        new Wander(
          movement.modes.wander,
          typeof radius === 'number' ? radius : undefined
        )
      );

    return new MovementSystem(
      movement,
      createHabitat(habitat, world),
      world,
      modes,
      this.animator
    );
  }
}
