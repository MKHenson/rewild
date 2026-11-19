import { Vector3 } from 'rewild-common';
import {
  Selector,
  SelectorBand,
  WaterQuerySample,
  WaterType,
  createWaterQuerySample,
} from 'rewild-renderer';
import {
  AirHabitatSettings,
  HabitatSettings,
  LandHabitatSettings,
  WaterHabitatSettings,
} from './CreaturePresets';

/** What creatures read the world through. */
export interface CreatureWorld {
  /** Ground height at world (x, z); null where it is not loaded. */
  sampleHeight(x: number, z: number): number | null;
  /** The water at world (x, z) into `out`. */
  sampleWater(x: number, z: number, out: WaterQuerySample): boolean;
  /** A water type's index in the palette `typeWeights` follows, or -1. */
  waterTypeIndex(name: WaterType['name']): number;
  /** The player's position into `out`; false when there is no player. */
  playerPosition(out: Vector3): boolean;
}

/** The heights a creature may be at over a point. */
export interface HeightRange {
  min: number;
  max: number;
}

/** Answers whether a creature may be at a point. */
export interface Habitat {
  /** Never falls. */
  readonly flies?: boolean;
  /** Moves in 3D, so modes measure the player in 3D. */
  readonly swims?: boolean;
  /** Seconds of travel ahead to check `heightRange` for rising ground. */
  readonly lookAhead?: number;
  canBe(x: number, z: number): boolean;
  /** Whether the point is the wrong medium, where the creature stays still. */
  stranded?(x: number, z: number): boolean;
  /** The heights over a point into `out`; false where there are none. Left
   *  out, the creature stands on the ground. */
  heightRange?(x: number, z: number, out: HeightRange): boolean;
}

/** Spawn radius on land and in the air, where the player sees far. */
export const SPAWN_RADIUS = 120;
export const DESPAWN_RADIUS = 150;
/** Spawn radius under water, where the player sees tens of metres. */
export const WATER_SPAWN_RADIUS = 60;
export const WATER_DESPAWN_RADIUS = 80;

/** Metres between the height samples that measure slope. */
export const SLOPE_STEP = 0.5;
/** Selector coverage above which a point passes. */
export const HABITAT_PASS = 0.5;

const RAD_TO_DEG = 180 / Math.PI;

/** Smoothstep across a band: `from` → 0, `to` → 1. Matches the terrain crate. */
function bandCoverage(band: SelectorBand, value: number): number {
  const t = (value - band.from) / (band.to - band.from);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** A selector's coverage of `value`: the product of its bands. 1 with none. */
export function selectorCoverage(
  selector: Selector | undefined,
  value: number
): number {
  if (!selector) return 1;
  if (!Array.isArray(selector)) return bandCoverage(selector, value);
  let coverage = 1;
  for (let i = 0; i < selector.length; i++)
    coverage *= bandCoverage(selector[i], value);
  return coverage;
}

/** The coverage of depth and shore selectors over `water`. Dry ground is 0 m
 *  deep and 0 m from shore. */
export function waterCoverage(
  depth: Selector | undefined,
  shore: Selector | undefined,
  water: WaterQuerySample
): number {
  return (
    selectorCoverage(depth, water.wet ? water.depth : 0) *
    selectorCoverage(shore, water.wet ? water.shore : 0)
  );
}

/** Metres from the player inside which a group spawns and past which it
 *  despawns. */
export interface SpawnRange {
  spawn: number;
  despawn: number;
}

/** The spawn range a habitat sets, or its type's default. */
export function spawnRange(settings: HabitatSettings): SpawnRange {
  const water = settings.type === 'water';
  const spawn =
    settings.spawnRadius ?? (water ? WATER_SPAWN_RADIUS : SPAWN_RADIUS);
  const despawn =
    settings.despawnRadius ?? (water ? WATER_DESPAWN_RADIUS : DESPAWN_RADIUS);
  return { spawn, despawn: Math.max(despawn, spawn) };
}

export class LandHabitat implements Habitat {
  private readonly water = createWaterQuerySample();

  constructor(
    private readonly settings: LandHabitatSettings,
    private readonly world: CreatureWorld
  ) {}

  canBe(x: number, z: number): boolean {
    const { settings, world } = this;
    const height = world.sampleHeight(x, z);
    if (height === null) return false;

    let coverage = selectorCoverage(settings.height, height);

    if (settings.slope) {
      const east = world.sampleHeight(x + SLOPE_STEP, z) ?? height;
      const west = world.sampleHeight(x - SLOPE_STEP, z) ?? height;
      const north = world.sampleHeight(x, z + SLOPE_STEP) ?? height;
      const south = world.sampleHeight(x, z - SLOPE_STEP) ?? height;
      const gradient =
        Math.hypot(east - west, north - south) / (2 * SLOPE_STEP);
      coverage *= selectorCoverage(
        settings.slope,
        Math.atan(gradient) * RAD_TO_DEG
      );
    }

    if (settings.waterDepth) {
      const wet = world.sampleWater(x, z, this.water) && this.water.wet;
      coverage *= selectorCoverage(
        settings.waterDepth,
        wet ? this.water.depth : 0
      );
    }

    return coverage > HABITAT_PASS;
  }

  stranded(x: number, z: number): boolean {
    const { settings, water } = this;
    if (!settings.waterDepth) return false;
    if (!this.world.sampleWater(x, z, water) || !water.wet) return false;
    return selectorCoverage(settings.waterDepth, water.depth) <= HABITAT_PASS;
  }
}

export class WaterHabitat implements Habitat {
  readonly swims = true;
  private readonly water = createWaterQuerySample();
  private readonly range: HeightRange = { min: 0, max: 0 };

  constructor(
    private readonly settings: WaterHabitatSettings,
    private readonly world: CreatureWorld
  ) {}

  canBe(x: number, z: number): boolean {
    return this.heightRange(x, z, this.range);
  }

  stranded(x: number, z: number): boolean {
    return this.world.sampleHeight(x, z) !== null && !this.canBe(x, z);
  }

  heightRange(x: number, z: number, out: HeightRange): boolean {
    const { settings, water } = this;
    if (!this.world.sampleWater(x, z, water) || !water.wet) return false;
    out.min = water.ground + settings.bedMargin;
    out.max = water.level - settings.surfaceMargin;
    const { swim } = settings;
    if (swim) {
      const [near, far] = swim.band;
      if (swim.from === 'bed') {
        out.min = Math.max(out.min, water.ground + near);
        out.max = Math.min(out.max, water.ground + far);
      } else {
        out.min = Math.max(out.min, water.level - far);
        out.max = Math.min(out.max, water.level - near);
      }
    }
    return (
      out.min < out.max &&
      waterCoverage(settings.depth, settings.shore, water) > HABITAT_PASS &&
      this.typeAllowed()
    );
  }

  private typeAllowed(): boolean {
    const { waterTypes } = this.settings;
    if (!waterTypes) return true;
    let weight = 0;
    for (let i = 0; i < waterTypes.length; i++) {
      const index = this.world.waterTypeIndex(waterTypes[i]);
      if (index >= 0) weight += this.water.typeWeights[index];
    }
    return weight > HABITAT_PASS;
  }
}

export class AirHabitat implements Habitat {
  readonly flies = true;
  readonly lookAhead: number;
  private readonly water = createWaterQuerySample();

  constructor(
    private readonly settings: AirHabitatSettings,
    private readonly world: CreatureWorld
  ) {
    this.lookAhead = settings.lookAhead;
  }

  canBe(x: number, z: number): boolean {
    return this.world.sampleHeight(x, z) !== null;
  }

  heightRange(x: number, z: number, out: HeightRange): boolean {
    const { settings, water, world } = this;
    const ground = world.sampleHeight(x, z);
    if (ground === null) return false;
    const wet = world.sampleWater(x, z, water) && water.wet;
    const base = wet ? Math.max(ground, water.level) : ground;
    out.min = base + settings.band[0];
    out.max = base + settings.band[1];
    return true;
  }
}

/** The habitat a creature's settings describe. Sinew accepts one entry. */
export function createHabitat(
  settings: HabitatSettings[],
  world: CreatureWorld
): Habitat {
  if (settings.length !== 1)
    throw new Error('A creature needs exactly one habitat.');
  const habitat = settings[0];
  switch (habitat.type) {
    case 'land':
      return new LandHabitat(habitat, world);
    case 'water':
      return new WaterHabitat(habitat, world);
    case 'air':
      return new AirHabitat(habitat, world);
    default:
      throw new Error(
        `Unknown habitat '${(habitat as HabitatSettings).type}'.`
      );
  }
}
