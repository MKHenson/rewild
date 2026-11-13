import { BiomeCreatures } from 'rewild-renderer';
import { CreatureWorld, Habitat, HeightRange } from './Habitat';

/** Square metres in a hectare. */
const HECTARE = 10000;
/** Places tried inside the habitat for each animal of a group. */
export const MEMBER_ATTEMPTS = 4;
/** Metres from home a group's animals spawn when the rule leaves it out. */
export const DEFAULT_SPREAD = 4;
/** Prefix of every spawned creature's stable id. */
export const SPAWN_ID_PREFIX = 'spawn:';

const TWO_PI = Math.PI * 2;
const _range: HeightRange = { min: 0, max: 0 };

/** The parts of a biome spawn planning reads. */
export interface SpawnBiome {
  name: string;
  creatures?: BiomeCreatures[];
}

/** What spawn planning reads the world through, beside `CreatureWorld`. */
export interface SpawnSite {
  /** The named biome's weight at (x, z), 0 to 1. */
  biomeWeight(name: string, x: number, z: number): number;
  /** Where the named creature may be. Null skips its rules. */
  habitat(creature: string): Habitat | null;
}

export interface PlannedCreature {
  /** Stable across loads: the chunk and the creature's index in it. */
  id: string;
  x: number;
  y: number;
  z: number;
  /** Radians about Y. 0 faces +Z. */
  heading: number;
}

export interface PlannedGroup {
  rule: BiomeCreatures;
  homeX: number;
  homeZ: number;
  /** Radians about Y the home first drifts along. */
  heading: number;
  members: PlannedCreature[];
}

function mix(hash: number, value: number): number {
  hash = Math.imul(hash ^ value, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  return hash ^ (hash >>> 16);
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193);
  return hash;
}

/** A seeded random stream in [0, 1), the same for the same inputs. */
export function spawnRandom(
  seed: number,
  cx: number,
  cy: number,
  salt: number
): () => number {
  let state = mix(mix(mix(mix(0x9e3779b9, seed | 0), cx | 0), cy | 0), salt);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Every group the chunk at (`cx`, `cy`) spawns, `span` metres square and
 * centred on (`cx`, `cy`) × `span`. The seed and the chunk decide each group,
 * so a chunk with the same ground plans the same creatures. Each rule draws
 * from its own stream, so adding a rule leaves the others in place.
 */
export function planChunkSpawns(
  seed: number,
  cx: number,
  cy: number,
  span: number,
  biomes: readonly SpawnBiome[],
  site: SpawnSite,
  world: CreatureWorld
): PlannedGroup[] {
  const groups: PlannedGroup[] = [];
  const hectares = (span * span) / HECTARE;
  const left = (cx - 0.5) * span;
  const top = (cy - 0.5) * span;
  let index = 0;

  for (const biome of biomes) {
    const rules = biome.creatures;
    if (!rules) continue;
    const biomeSalt = hashString(biome.name);

    for (let r = 0; r < rules.length; r++) {
      const rule = rules[r];
      const habitat = site.habitat(rule.creature);
      if (!habitat) continue;

      const random = spawnRandom(seed, cx, cy, mix(biomeSalt, r));
      const expected = rule.density * hectares;
      const count = Math.floor(expected) + (random() < expected % 1 ? 1 : 0);
      const [min, max] = rule.group ?? [1, 1];
      const spread = rule.spread ?? DEFAULT_SPREAD;

      for (let g = 0; g < count; g++) {
        const homeX = left + random() * span;
        const homeZ = top + random() * span;
        const chance = random();
        const heading = random() * TWO_PI;
        const size = min + Math.floor(random() * (max - min + 1));

        if (chance >= site.biomeWeight(biome.name, homeX, homeZ)) continue;
        if (!habitat.canBe(homeX, homeZ)) continue;

        const members: PlannedCreature[] = [];
        for (let m = 0; m < size; m++) {
          for (let attempt = 0; attempt < MEMBER_ATTEMPTS; attempt++) {
            const angle = random() * TWO_PI;
            const distance = spread * Math.sqrt(random());
            const level = random();
            const x = homeX + Math.sin(angle) * distance;
            const z = homeZ + Math.cos(angle) * distance;
            if (!habitat.canBe(x, z)) continue;

            let y = world.sampleHeight(x, z) ?? 0;
            if (habitat.heightRange?.(x, z, _range))
              y = _range.min + level * (_range.max - _range.min);

            members.push({
              id: `${SPAWN_ID_PREFIX}${cx},${cy}:${index++}`,
              x,
              y,
              z,
              heading: random() * TWO_PI,
            });
            break;
          }
        }

        if (members.length)
          groups.push({ rule, homeX, homeZ, heading, members });
      }
    }
  }
  return groups;
}
