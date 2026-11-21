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
import { FootPlant } from '../creatures/FootPlant';
import { CreatureWorld, createHabitat } from '../creatures/Habitat';
import { HeadLook } from '../creatures/HeadLook';
import { IMovementMode, MovementSystem } from '../creatures/MovementSystem';
import { Seek } from '../creatures/modes/Seek';
import { Wander } from '../creatures/modes/Wander';
import { SwimDriver } from '../creatures/SwimDriver';
import { SkinnedAsset } from './SkinnedAsset';
import { StateMachineData } from './Types';

/** The world as creatures read it in game. */
export function createCreatureWorld(data: StateMachineData): CreatureWorld {
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

/**
 * A skinned asset that moves on its own. In game it reads the world from the
 * state machine on mount and builds its movement system. In the editor it
 * only plays idle.
 */
export class Creature extends SkinnedAsset {
  /** Every creature mounted in game and not yet disposed. */
  static readonly live = new Set<Creature>();
  readonly preset: CreaturePreset;
  movement: MovementSystem | null = null;
  headLook: HeadLook | null = null;
  footPlant: FootPlant | null = null;
  swim: SwimDriver | null = null;

  private readonly hasLookChain: boolean;
  private readonly hasLegs: boolean;

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

    const legs = animation.bones?.legs;
    this.hasLegs = !!legs && !!preset.footIK;
    if (legs && preset.footIK) skinned.setLegs(legs);

    if (preset.driver === 'swim') {
      const spine = animation.bones?.spine;
      if (!spine || !preset.swim)
        throw new Error(
          `The swim driver needs the template's bones.spine and the preset's swim.`
        );
      skinned.setChain(spine, preset.swim);
    }
  }

  mount(): void {
    super.mount();
    const sm = this.stateMachine as StateMachine<StateMachineData> | null;
    const data = sm?.data;
    if (!data?.gameManager) return;

    if (!this.movement) {
      const world = createCreatureWorld(data);
      this.movement = this.createMovement(world);
      if (this.hasLookChain)
        this.headLook = new HeadLook(
          this.preset.lookAt!,
          this.skinned,
          this.transform,
          world
        );
      if (this.hasLegs)
        this.footPlant = new FootPlant(
          this.preset.footIK!,
          this.skinned,
          this.transform,
          world
        );
      if (this.preset.driver === 'swim')
        this.swim = new SwimDriver(
          this.preset.swim!,
          this.skinned.chainLength * this.transform.scale.x,
          this.skinned,
          this.animator
        );
    }
    this.movement.placeAt(this.initialPosition, this.initialRotation);
    this.swim?.reset(this.movement.heading);
    Creature.live.add(this);
  }

  dispose(): void {
    Creature.live.delete(this);
    super.dispose();
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
