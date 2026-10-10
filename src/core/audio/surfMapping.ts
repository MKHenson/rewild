import { smoothstep } from 'rewild-common';

/** Metres from the shore within which the surf plays at full gain. */
export const SURF_NEAR = 15;
/** How fast the surf falls past SURF_NEAR: a beach is a long source, so it falls slower than a point. */
const SURF_FALLOFF = 0.8;
/** Metres over which the surf fades out to nothing. */
export const SURF_FADE_FROM = 500;
export const SURF_FADE_TO = 900;

/** Windiness over which the sea goes from calm to storm. */
export const SEA_CALM = 0.25;
export const SEA_STORM = 0.75;
/** The surf's gain on a calm sea, as a share of a storm's. */
export const SURF_CALM_LEVEL = 0.6;

/** Metres from the shoreline within which the lapping plays at full gain. */
export const LAP_NEAR = 3;
/** Metres over which the lapping fades out to nothing. */
export const LAP_FADE_FROM = 30;
export const LAP_FADE_TO = 60;
/** The lapping's gain in still air, as a share of its gain in a strong wind. */
export const LAP_CALM_LEVEL = 0.35;
/** Windiness over which the lapping grows from calm to full. */
const LAP_WIND_FROM = 0.1;
const LAP_WIND_TO = 0.6;

/** The surf's gain `distance` metres from the shore. */
export function surfDistanceGain(distance: number): number {
  const near = Math.pow(
    SURF_NEAR / Math.max(distance, SURF_NEAR),
    SURF_FALLOFF
  );
  return near * (1 - smoothstep(distance, SURF_FADE_FROM, SURF_FADE_TO));
}

/** 0..1: the sea state from the windiness, calm to storm. */
export function seaState(windiness: number): number {
  return smoothstep(windiness, SEA_CALM, SEA_STORM);
}

function surfLevel(sea: number): number {
  return SURF_CALM_LEVEL + (1 - SURF_CALM_LEVEL) * sea;
}

/** The calm surf loop's gain: the whole sound on a calm sea, crossfading out with equal power. */
export function surfCalmGain(sea: number): number {
  return Math.cos((sea * Math.PI) / 2) * surfLevel(sea);
}

/** The storm surf loop's gain: crossfading in as the sea rises. */
export function surfStormGain(sea: number): number {
  return Math.sin((sea * Math.PI) / 2) * surfLevel(sea);
}

/** The lapping's gain `distance` metres from the shoreline. */
export function lapDistanceGain(distance: number): number {
  const near = LAP_NEAR / Math.max(distance, LAP_NEAR);
  return near * (1 - smoothstep(distance, LAP_FADE_FROM, LAP_FADE_TO));
}

/** The lapping's gain at the shore of water that laps by `lapping`, 0..1, louder in wind. */
export function lapLevel(lapping: number, windiness: number): number {
  const wind = smoothstep(windiness, LAP_WIND_FROM, LAP_WIND_TO);
  return (
    Math.min(1, Math.max(0, lapping)) *
    (LAP_CALM_LEVEL + (1 - LAP_CALM_LEVEL) * wind)
  );
}

/** Metres above the sea within which the open sea plays at full gain. */
export const OPEN_SEA_NEAR = 3;
/** Metres above the sea by which the open sea has faded out. */
export const OPEN_SEA_FAR = 60;

/** The open sea's gain `height` metres above water that is `ocean` 0..1 ocean, louder as the sea rises. */
export function openSeaGain(
  height: number,
  ocean: number,
  sea: number
): number {
  return (
    Math.min(1, Math.max(0, ocean)) *
    (1 - smoothstep(height, OPEN_SEA_NEAR, OPEN_SEA_FAR)) *
    surfLevel(sea)
  );
}
