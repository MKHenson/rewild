import { Vector3 } from 'rewild-common';
import {
  Selector,
  SelectorBand,
  WaterQuerySample,
  createWaterQuerySample,
} from 'rewild-renderer';
import { HabitatSettings, LandHabitatSettings } from './CreaturePresets';

/** What creatures read the world through. */
export interface CreatureWorld {
  /** Ground height at world (x, z); null where it is not loaded. */
  sampleHeight(x: number, z: number): number | null;
  /** The water at world (x, z) into `out`. */
  sampleWater(x: number, z: number, out: WaterQuerySample): boolean;
  /** The player's position into `out`; false when there is no player. */
  playerPosition(out: Vector3): boolean;
}

/** Answers whether a creature may be at a point. */
export interface Habitat {
  canBe(x: number, z: number): boolean;
}

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
    default:
      throw new Error(
        `Unknown habitat '${(habitat as HabitatSettings).type}'.`
      );
  }
}
