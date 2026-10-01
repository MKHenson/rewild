import { smoothstep } from 'rewild-common';
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

// Lapping: where no shore waves reach, as on a lake, the wind's short chop runs
// up the shore as one train, slow and gentle in calm air and quicker as the
// wind rises. Its phase is carried from frame to frame (WaterWaves), so a
// change in its period never makes it jump.

/** Seconds per lap in calm air and in a gale. */
export const LAKE_LAP_PERIOD_CALM = 6;
export const LAKE_LAP_PERIOD_GALE = 2.5;
/** Metres the lapping runs up the shore in calm air and in a gale. */
export const LAKE_RUNUP_CALM = 0.02;
export const LAKE_RUNUP_GALE = 0.1;
/** Wind speeds in m/s over which the runup grows from calm to gale. */
export const LAKE_WIND_CALM = 2;
export const LAKE_WIND_GALE = 18;
/** Wind speeds in m/s over which edge foam grows from none to full. */
export const LAKE_FOAM_WIND_FROM = 5;
export const LAKE_FOAM_WIND_TO = 14;


/** The lapping's angular frequency in a `windSpeed` m/s wind. */
export function lakeLapOmega(windSpeed: number): number {
  const period =
    LAKE_LAP_PERIOD_CALM +
    (LAKE_LAP_PERIOD_GALE - LAKE_LAP_PERIOD_CALM) *
      smoothstep(windSpeed, LAKE_WIND_CALM, LAKE_WIND_GALE);
  return (Math.PI * 2) / period;
}

/** Metres the lapping runs up the shore in a `windSpeed` m/s wind. */
export function lakeRunup(windSpeed: number): number {
  return (
    LAKE_RUNUP_CALM +
    (LAKE_RUNUP_GALE - LAKE_RUNUP_CALM) *
      smoothstep(windSpeed, LAKE_WIND_CALM, LAKE_WIND_GALE)
  );
}

/** 0..1: how much edge foam a `windSpeed` m/s wind drives into the shallows. */
export function lakeEdgeFoam(windSpeed: number): number {
  return smoothstep(windSpeed, LAKE_FOAM_WIND_FROM, LAKE_FOAM_WIND_TO);
}

/**
 * The lapping's phase, in 0..2π, `phase` advanced by the seconds from
 * `fromTime` to `toTime` on the ocean's looping clock at angular frequency
 * `omega`. A step back is the clock looping; a long step, such as a paused
 * tab, advances by LAKE_MAX_STEP at most.
 */
export function advanceLakePhase(
  phase: number,
  omega: number,
  fromTime: number,
  toTime: number
): number {
  let seconds = toTime - fromTime;
  if (seconds < 0) seconds += OCEAN_LOOP_SECONDS;
  seconds = Math.min(seconds, LAKE_MAX_STEP);
  const next = (phase + omega * seconds) % (Math.PI * 2);
  return next < 0 ? next + Math.PI * 2 : next;
}

/** Seconds the lapping advances by at most in one frame. */
export const LAKE_MAX_STEP = 0.25;

/** Each train's phase in radians at `time` on the ocean clock, in 0..2π. */
export function shorePhase(train: number, time: number): number {
  const phase = (SHORE_OMEGAS[train] * time) % (Math.PI * 2);
  return phase < 0 ? phase + Math.PI * 2 : phase;
}
