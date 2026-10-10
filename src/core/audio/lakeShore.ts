import type { WaterQuerySample } from 'rewild-renderer/lib/renderers/water/WaterQuery';
import { LAP_FADE_TO } from './surfMapping';

/** Bearings searched for the shoreline around the listener. */
const BEARINGS = 16;
/** Metres between samples along a bearing. */
const STEP = 4;
/** Halvings that place a shoreline found between two samples. */
const BISECTIONS = 4;
/** The least lapping that counts as a lapping shore. */
const LAPPING_FROM = 0.05;

const COS = new Float64Array(BEARINGS);
const SIN = new Float64Array(BEARINGS);
for (let b = 0; b < BEARINGS; b++) {
  COS[b] = Math.cos((b / BEARINGS) * Math.PI * 2);
  SIN[b] = Math.sin((b / BEARINGS) * Math.PI * 2);
}

/** The water at world (x, z) into `out` (WaterQuery.sample); false where the ground is not loaded. */
export type WaterSampler = (
  x: number,
  z: number,
  out: WaterQuerySample
) => boolean;

/** A point on a shoreline that laps (findLapping). */
export interface LapPoint {
  x: number;
  y: number;
  z: number;
  /** Metres from the point searched around. */
  distance: number;
  /** 0..1: how strongly the water there laps. */
  lapping: number;
}

/** How strongly the water in `sample` laps: its type weights over each type's `lapping`. */
export function lappingOf(
  sample: WaterQuerySample,
  lapping: ArrayLike<number>
): number {
  if (!sample.wet) return 0;
  let total = 0;
  for (let c = 0; c < lapping.length; c++)
    total += sample.typeWeights[c] * lapping[c];
  return total;
}

/**
 * The nearest shoreline within LAP_FADE_TO metres of world (`x`, `z`) whose
 * water laps, into `out`: where water meets dry ground along one of BEARINGS
 * bearings. `lapping` holds each water type's lapping. `scratch` is
 * overwritten. False when there is none.
 */
export function findLapping(
  sample: WaterSampler,
  x: number,
  z: number,
  lapping: ArrayLike<number>,
  scratch: WaterQuerySample,
  out: LapPoint
): boolean {
  if (!sample(x, z, scratch)) return false;
  const originWet = scratch.wet;
  const originLapping = lappingOf(scratch, lapping);
  const originLevel = scratch.level;
  let found = false;
  out.distance = Infinity;

  for (let b = 0; b < BEARINGS; b++) {
    let wasWet = originWet;
    let wasLapping = originLapping;
    let wasLevel = originLevel;
    for (let r = STEP; r <= LAP_FADE_TO + STEP; r += STEP) {
      if (r - STEP >= out.distance) break;
      if (!sample(x + COS[b] * r, z + SIN[b] * r, scratch)) break;
      if (scratch.wet === wasWet) {
        wasLapping = lappingOf(scratch, lapping);
        wasLevel = scratch.level;
        continue;
      }
      let near = r - STEP;
      let far = r;
      let wetLapping = scratch.wet ? lappingOf(scratch, lapping) : wasLapping;
      let wetLevel = scratch.wet ? scratch.level : wasLevel;
      for (let i = 0; i < BISECTIONS; i++) {
        const mid = (near + far) / 2;
        if (!sample(x + COS[b] * mid, z + SIN[b] * mid, scratch)) break;
        if (scratch.wet === wasWet) near = mid;
        else far = mid;
        if (scratch.wet) {
          wetLapping = lappingOf(scratch, lapping);
          wetLevel = scratch.level;
        }
      }
      const distance = (near + far) / 2;
      if (wetLapping >= LAPPING_FROM && distance < out.distance) {
        found = true;
        out.x = x + COS[b] * distance;
        out.z = z + SIN[b] * distance;
        out.y = wetLevel;
        out.distance = distance;
        out.lapping = wetLapping;
      }
      break;
    }
  }
  return found;
}
