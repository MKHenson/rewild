import { LocomotionSetName } from 'models';
import { Selector } from 'rewild-renderer';

/** Where a land creature may be. Selectors read as in biome scatter rules. */
export interface LandHabitatSettings {
  type: 'land';
  /** Degrees from horizontal. */
  slope?: Selector;
  /** Absolute world metres. */
  height?: Selector;
  /** Metres of water over the ground; 0 when dry. */
  waterDepth?: Selector;
}

export type HabitatSettings = LandHabitatSettings;

/** Something a creature may do while it waits. */
export interface WanderAction {
  /** The action played for the whole wait. Null stands in idle. */
  meaning: string | null;
  /** Relative chance against the other actions. */
  weight: number;
}

export interface WanderSettings {
  /** Metres from home a target may be. */
  radius: number;
  /** Seconds to wait at a target, picked at random in this range. */
  wait: [number, number];
  /** One is picked by weight for each wait. None stands in idle. */
  actions: WanderAction[];
}

export interface SeekSettings {
  /** Metres from the player at which the mode takes control. */
  radius: number;
  /** Metres from the player at which it lets go. Larger than `radius`. */
  release: number;
  /** Locomotion set used while in control. */
  locomotion?: LocomotionSetName;
}

export interface MovementSettings {
  /** m/s. */
  walkSpeed: number;
  /** m/s. */
  runSpeed: number;
  /** rad/s. */
  turnRate: number;
  /** m/s². */
  acceleration: number;
  modes: {
    wander?: WanderSettings;
    evade?: SeekSettings;
    seek?: SeekSettings;
  };
}

/** A creature's settings. A template names one with `preset`. */
export interface CreaturePreset {
  driver: 'clips';
  movement: MovementSettings;
  /** One entry in Sinew. */
  habitat: HabitatSettings[];
}

export const CREATURE_PRESETS: Record<string, CreaturePreset> = {
  chicken: {
    driver: 'clips',
    movement: {
      walkSpeed: 0.6,
      runSpeed: 2.5,
      turnRate: 4,
      acceleration: 6,
      modes: {
        wander: {
          radius: 6,
          wait: [2, 6],
          actions: [
            { meaning: 'eat', weight: 3 },
            { meaning: null, weight: 2 },
            { meaning: 'rest', weight: 3 },
          ],
        },
        evade: { radius: 5, release: 8, locomotion: 'flee' },
      },
    },
    habitat: [
      {
        type: 'land',
        slope: { from: 35, to: 30 },
        waterDepth: { from: 0.3, to: 0.2 },
      },
    ],
  },
};

export function getCreaturePreset(name: string): CreaturePreset {
  const preset = CREATURE_PRESETS[name];
  if (!preset) throw new Error(`Unknown creature preset '${name}'.`);
  return preset;
}
