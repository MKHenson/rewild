import { LocomotionSetName } from 'models';
import { Selector, WaterType } from 'rewild-renderer';

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

/** Where a water creature may be. Heights are of its pivot. */
export interface WaterHabitatSettings {
  type: 'water';
  /** Metres kept above the bed. */
  bedMargin: number;
  /** Metres kept below the surface at rest. */
  surfaceMargin: number;
  /** Water type names it lives in. Any water when left out. */
  waterTypes?: WaterType['name'][];
}

/** Where a flying creature may be. */
export interface AirHabitatSettings {
  type: 'air';
  /** Lowest and highest metres above the ground or the water. */
  band: [number, number];
  /** Seconds of flight ahead it checks for rising ground. */
  lookAhead: number;
}

export type HabitatSettings =
  | LandHabitatSettings
  | WaterHabitatSettings
  | AirHabitatSettings;

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
  /** Picks each point further round home, so the creature circles it. */
  circle?: boolean;
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
  /** m/s it never slows below inside its habitat. */
  cruiseSpeed?: number;
  /** m/s it changes height at. Left out, it stands on the ground. */
  climbSpeed?: number;
  /** Radians it rolls at its full turn rate. */
  bank?: number;
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
  tuna: {
    driver: 'clips',
    movement: {
      walkSpeed: 0.8,
      runSpeed: 1.6,
      turnRate: 2,
      acceleration: 1.5,
      cruiseSpeed: 0.5,
      climbSpeed: 0.4,
      modes: {
        wander: { radius: 8, wait: [0, 0], actions: [] },
      },
    },
    habitat: [{ type: 'water', bedMargin: 0.2, surfaceMargin: 0.4 }],
  },
  crow: {
    driver: 'clips',
    movement: {
      walkSpeed: 6,
      runSpeed: 9,
      turnRate: 0.9,
      acceleration: 4,
      cruiseSpeed: 5,
      climbSpeed: 3,
      bank: 0.5,
      modes: {
        wander: { radius: 30, wait: [0, 0], actions: [], circle: true },
      },
    },
    habitat: [{ type: 'air', band: [15, 30], lookAhead: 3 }],
  },
};

export function getCreaturePreset(name: string): CreaturePreset {
  const preset = CREATURE_PRESETS[name];
  if (!preset) throw new Error(`Unknown creature preset '${name}'.`);
  return preset;
}
