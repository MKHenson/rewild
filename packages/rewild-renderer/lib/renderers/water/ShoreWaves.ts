import { OCEAN_LOOP_SECONDS } from './OceanSpectrum';

// The ocean's shore waves: two trains whose crests roll in along the travel
// time from deep water (ShoreField), beating into sets. Their periods are fixed, so a
// change in the wind changes only their height and the surface never jumps.

/** Seconds per wave of each train, before snapping to the ocean's loop. */
export const SHORE_PERIODS = [8, 9.7];
/** Breaker height as a share of the open sea's significant height. */
export const SHORE_HEIGHT_SHARE = 0.5;
/** Metres: the breaker height on a still day. */
export const SHORE_MIN_HEIGHT = 0.8;

/** Each train's angular frequency, a whole number of cycles over the loop. */
export const SHORE_OMEGAS = SHORE_PERIODS.map(
  (period) =>
    (Math.PI * 2 * Math.max(1, Math.round(OCEAN_LOOP_SECONDS / period))) /
    OCEAN_LOOP_SECONDS
);

/** The breaker height in metres for the open sea's per-cascade RMS heights. */
export function shoreWaveHeight(
  cascadeRms: ArrayLike<number>,
  strength: number
): number {
  let variance = 0;
  for (let c = 0; c < cascadeRms.length; c++)
    variance += cascadeRms[c] * cascadeRms[c];
  return (
    Math.max(SHORE_MIN_HEIGHT, 4 * Math.sqrt(variance) * SHORE_HEIGHT_SHARE) *
    strength
  );
}

/** Each train's phase in radians at `time` on the ocean clock, in 0..2π. */
export function shorePhase(train: number, time: number): number {
  const phase = (SHORE_OMEGAS[train] * time) % (Math.PI * 2);
  return phase < 0 ? phase + Math.PI * 2 : phase;
}
