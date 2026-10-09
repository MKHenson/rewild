import { dbToGain } from 'rewild-audio';

/** Metres a second sound travels in air. */
export const SPEED_OF_SOUND = 343;

/** Below this distance in metres, thunder cracks before it rumbles. */
export const THUNDER_CLOSE_BELOW = 1000;

/** Seconds late a thunder can be and still play. Later than this it is dropped. */
export const THUNDER_LATE_BY = 1;

/** The distances the gain and the cutoff are set between. */
const NEAR = 700;
const FAR = 1900;

/** The cutoff of thunder at `NEAR` and at `FAR`. Far thunder is deeper. */
const CUTOFF_NEAR = 9000;
const CUTOFF_FAR = 1200;

/** Thunder's gain at `NEAR` and closer. Above 1, as thunder is the loudest
 *  thing in the world; the master compressor keeps it from clipping. */
export const THUNDER_LEVEL = 2.5;

/** How fast thunder fades past `NEAR`: gain is THUNDER_LEVEL × (NEAR / d) ^ FALLOFF. */
const FALLOFF = 0.8;

/** How far the rain, the wind and the land duck under the nearest thunder. */
export const THUNDER_DUCK_DB = -12;

/** Seconds the duck holds after thunder arrives, for each sound, before it lets go. */
const DUCK_HOLD: Readonly<Record<ThunderSoundName, number>> = {
  'thunder-close': 3,
  'thunder-far': 4,
  'thunder-chain': 0.8,
};

/** Seconds by e for the duck to let go after its hold. */
const DUCK_RELEASE = 1.5;

export type ThunderSoundName = 'thunder-close' | 'thunder-far' | 'thunder-chain';

/** Seconds from now until thunder from `distance` metres arrives, for a strike `age` seconds ago. */
export function thunderDelay(distance: number, age: number): number {
  return distance / SPEED_OF_SOUND - age;
}

/** The sound for a strike: a short crack for a chained one, then crack and rumble near, rumble far. */
export function thunderSound(distance: number, chain: number): ThunderSoundName {
  if (chain > 0) return 'thunder-chain';
  return distance < THUNDER_CLOSE_BELOW ? 'thunder-close' : 'thunder-far';
}

/** Thunder's gain at `distance` metres: `THUNDER_LEVEL` near, quieter far. */
export function thunderGain(distance: number): number {
  return THUNDER_LEVEL * Math.pow(NEAR / Math.max(NEAR, distance), FALLOFF);
}

/** Thunder's low-pass cutoff in Hz at `distance` metres: bright near, deep far. */
export function thunderCutoff(distance: number): number {
  const t = Math.min(1, Math.max(0, (distance - NEAR) / (FAR - NEAR)));
  return CUTOFF_NEAR * Math.pow(CUTOFF_FAR / CUTOFF_NEAR, t);
}

/** Seconds the duck under `sound` holds once it arrives. */
export function thunderDuckHold(sound: ThunderSoundName): number {
  return DUCK_HOLD[sound];
}

/**
 * The level 0..1 thunder of `gain` ducks the rest of the world to: the full
 * `THUNDER_DUCK_DB` at `THUNDER_LEVEL`, less for quieter, further thunder.
 */
export function thunderDuckLevel(gain: number): number {
  const share = Math.min(1, Math.max(0, gain / THUNDER_LEVEL));
  return 1 - (1 - dbToGain(THUNDER_DUCK_DB)) * share;
}

/**
 * The duck `since` seconds after thunder arrived: none before it, `level`
 * while it holds for `hold` seconds, then letting go by e every `DUCK_RELEASE`.
 */
export function thunderDuck(since: number, hold: number, level: number): number {
  if (since < 0) return 1;
  const weight = since < hold ? 1 : Math.exp(-(since - hold) / DUCK_RELEASE);
  return 1 - (1 - level) * weight;
}
