import { LocomotionSetName } from 'models';
import { ChainShape, Selector, WaterType } from 'rewild-renderer';
import { FlockSettings } from './Flocking';

/** How near the player a habitat's creatures spawn. */
export interface SpawnRangeSettings {
  /** Metres from the player inside which a group spawns. Defaults by type. */
  spawnRadius?: number;
  /** Metres from the player past which a group despawns. Larger than
   *  `spawnRadius`. Defaults by type. */
  despawnRadius?: number;
}

/** Where a land creature may be. Selectors read as in biome scatter rules. */
export interface LandHabitatSettings extends SpawnRangeSettings {
  type: 'land';
  /** Degrees from horizontal. */
  slope?: Selector;
  /** Absolute world metres. */
  height?: Selector;
  /** Metres of water over the ground; 0 when dry. */
  waterDepth?: Selector;
}

/** Metres of water a creature keeps to, measured up from the bed or down
 *  from the surface at rest. */
export interface SwimBand {
  from: 'bed' | 'surface';
  band: [number, number];
}

/** Where a water creature may be. Heights are of its pivot. */
export interface WaterHabitatSettings extends SpawnRangeSettings {
  type: 'water';
  /** Metres kept above the bed. */
  bedMargin: number;
  /** Metres kept below the surface at rest. */
  surfaceMargin: number;
  /** Narrows the heights between the margins. Left out, it uses all of them. */
  swim?: SwimBand;
  /** Metres of water from the bed to the surface at rest. */
  depth?: Selector;
  /** Metres to dry ground, up to SHORE_CAP. */
  shore?: Selector;
  /** Water type names it lives in. Any water when left out. */
  waterTypes?: WaterType['name'][];
}

/** Where a flying creature may be. */
export interface AirHabitatSettings extends SpawnRangeSettings {
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

/** How a creature keeps station through a wait, as a hovering fish does. */
export interface HoldSettings {
  /** Metres from the spot it drifts to, at most. */
  drift: number;
  /** Seconds between drifts, picked at random in this range. */
  every: [number, number];
  /** m/s it drifts at. */
  speed: number;
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
  /** Holds the spot through each wait with small drifts, instead of stopping. */
  hold?: HoldSettings;
}

export interface SeekSettings {
  /** Metres from the player at which the mode takes control. */
  radius: number;
  /** Metres from the player at which it lets go. Larger than `radius`. */
  release: number;
  /** Locomotion set used while in control. */
  locomotion?: LocomotionSetName;
  /** m/s the player must move at before it notices them, so a still player
   *  can come close. Left out, it notices a still player too. */
  startle?: number;
}

/** How a creature travels with its group while their home is on the move. */
export type ShoalSettings = FlockSettings;

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
  /** Seconds its speed takes to fall by about two thirds as it coasts, as
   *  water drags on a fish. Left out, it slows at `acceleration`. */
  glide?: number;
  /** m/s it changes height at. Left out, it stands on the ground. */
  climbSpeed?: number;
  /** Radians it rolls at its full turn rate. */
  bank?: number;
  /** Radians it tilts its nose toward its climb, at most. Needs `climbSpeed`. */
  pitch?: number;
  modes: {
    wander?: WanderSettings;
    evade?: SeekSettings;
    seek?: SeekSettings;
    shoal?: ShoalSettings;
  };
}

/** How a creature's head follows the player. */
export interface LookAtSettings {
  /** Metres from the player at which it looks. */
  radius: number;
  /** Radians left or right of forward. Past this it looks forward again. */
  yawLimit: number;
  /** Radians above or below forward. Past this it looks forward again. */
  pitchLimit: number;
  /** Seconds the head takes to settle on a new direction. */
  smoothing: number;
}

/** How a creature's feet follow the terrain. */
export interface FootIKSettings {
  /** Seconds a foot takes to settle on a new height. */
  smoothing: number;
  /** Part of a leg's reach a foot may move up or down. */
  maxStep: number;
  /** Part of the slope along the body it pitches to, 0 to 1. Three or more legs only. */
  pitch?: number;
  /** Part of the slope across the body it rolls to, 0 to 1. Three or more legs only. */
  roll?: number;
}

/** Beats then glides in turn while cruising. */
export interface BurstSettings {
  /** Tail beats in each burst, picked at random in this range. */
  beats: [number, number];
  /** Seconds of each glide, picked at random in this range. */
  coast: [number, number];
}

/**
 * How the swim driver bends the spine. `stiff` and `wavelength` shape the
 * wave along the template's `bones.spine`.
 */
export interface SwimSettings extends ChainShape {
  /** Radians the tail swings either side while cruising. */
  amplitude: number;
  /** Metres it moves for each tail beat, about 0.7 of its body length. */
  stride: number;
  /** Tail beats a second while it hovers. */
  hoverBeat: number;
  /** Tail beats a second at most, bursts and escapes included. */
  maxBeat: number;
  /** Radians the spine curves from front to back, at most. It curves to lie
   *  along the arc it swims. */
  turnCurve: number;
  /** Left out, it beats steadily while cruising. */
  burst?: BurstSettings;
  /** Radians the body snaps into a C as it starts to flee. Left out, it does not. */
  escape?: number;
  /** An action played as it starts to flee, and by chance as a burst starts. */
  dash?: DashSettings;
}

export interface DashSettings {
  /** The action it plays. The template's `clips` maps it to a clip, else the
   *  clip of that name. */
  meaning: string;
  /** Chance, 0 to 1, it plays as a burst starts. */
  chance: number;
}

/** A creature's settings. A template names one with `preset`. */
export interface CreaturePreset {
  /** `swim` needs `swim` and the template's `bones.spine`. */
  driver: 'clips' | 'swim';
  swim?: SwimSettings;
  movement: MovementSettings;
  /** Needs the template's `bones.lookAt`. Left out, the head follows clips. */
  lookAt?: LookAtSettings;
  /** Needs the template's `bones.legs`. Left out, the feet follow clips. */
  footIK?: FootIKSettings;
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
    lookAt: { radius: 12, yawLimit: 1.75, pitchLimit: 0.9, smoothing: 0.18 },
    habitat: [
      {
        type: 'land',
        slope: { from: 35, to: 30 },
        waterDepth: { from: 0.3, to: 0.2 },
      },
    ],
  },
  tuna: {
    driver: 'swim',
    swim: {
      stiff: 0.15,
      wavelength: 1.1,
      head: 0.12,
      amplitude: 0.5,
      stride: 0.8,
      hoverBeat: 0.8,
      maxBeat: 3,
      turnCurve: 0.9,
      burst: { beats: [3, 6], coast: [0.4, 1] },
      escape: 1.2,
      dash: { meaning: 'dash', chance: 0.2 },
    },
    movement: {
      walkSpeed: 1.6,
      runSpeed: 3.2,
      turnRate: 1.2,
      acceleration: 1.5,
      cruiseSpeed: 1,
      glide: 1.5,
      climbSpeed: 0.6,
      pitch: 0.4,
      modes: {
        wander: { radius: 15, wait: [0, 0], actions: [] },
        evade: { radius: 3, release: 7, startle: 0.5 },
        shoal: {
          cruiseSpeed: 1.2,
          neighbourRadius: 6,
          spacing: 1.8,
          separation: 2.5,
          alignment: 1.2,
          cohesion: 0.8,
          home: 0.6,
          homeRadius: 8,
        },
      },
    },
    habitat: [
      {
        type: 'water',
        bedMargin: 0.4,
        surfaceMargin: 1,
        depth: { from: 4, to: 6 },
        waterTypes: ['ocean'],
      },
    ],
  },
  trout: {
    driver: 'swim',
    swim: {
      stiff: 0.1,
      wavelength: 1,
      head: 0.15,
      amplitude: 0.55,
      stride: 0.3,
      hoverBeat: 0.6,
      maxBeat: 4,
      turnCurve: 1,
      burst: { beats: [2, 4], coast: [0.5, 1.5] },
      escape: 1.3,
      dash: { meaning: 'dash', chance: 0.25 },
    },
    movement: {
      walkSpeed: 0.4,
      runSpeed: 2.5,
      turnRate: 3,
      acceleration: 3,
      glide: 0.8,
      climbSpeed: 0.3,
      pitch: 0.35,
      modes: {
        wander: {
          radius: 6,
          wait: [4, 12],
          actions: [],
          hold: { drift: 0.6, every: [1.5, 4], speed: 0.15 },
        },
        evade: { radius: 3, release: 6, startle: 0.5 },
      },
    },
    habitat: [
      {
        type: 'water',
        bedMargin: 0.08,
        surfaceMargin: 0.12,
        depth: { from: 0.3, to: 0.45 },
        waterTypes: ['lake'],
        spawnRadius: 35,
        despawnRadius: 40,
      },
    ],
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
  lioness: {
    driver: 'clips',
    movement: {
      walkSpeed: 0.78,
      runSpeed: 11.5,
      turnRate: 2.5,
      acceleration: 8,
      modes: {
        wander: { radius: 15, wait: [4, 10], actions: [] },
        evade: { radius: 10, release: 18 },
      },
    },
    lookAt: { radius: 18, yawLimit: 1.4, pitchLimit: 0.6, smoothing: 0.25 },
    habitat: [
      {
        type: 'land',
        slope: { from: 40, to: 35 },
        waterDepth: { from: 0.5, to: 0.4 },
      },
    ],
  },
  trex: {
    driver: 'clips',
    movement: {
      walkSpeed: 6.6,
      runSpeed: 7.5,
      turnRate: 0.8,
      acceleration: 2,
      modes: {
        wander: { radius: 40, wait: [6, 15], actions: [] },
      },
    },
    lookAt: { radius: 80, yawLimit: 1.3, pitchLimit: 1.1, smoothing: 0.5 },
    footIK: { smoothing: 0.15, maxStep: 0.35 },
    habitat: [
      {
        type: 'land',
        slope: { from: 30, to: 25 },
        waterDepth: { from: 2, to: 1.5 },
      },
    ],
  },
};

export function getCreaturePreset(name: string): CreaturePreset {
  const preset = CREATURE_PRESETS[name];
  if (!preset) throw new Error(`Unknown creature preset '${name}'.`);
  return preset;
}
