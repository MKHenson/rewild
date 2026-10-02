import { smoothstep } from 'rewild-common';

// The foliage's gust field (gustField in scatter-wind.wgsl) on the CPU, so
// what the wind does to the player arrives with the gusts the trees bend to.
// The hash is integer arithmetic on both sides, so the two agree exactly.
// Change both together.

const GUST_LENGTH = 60;
const GUST_SPEED = 20;
const EDDY_DRIFT = 0.55;

function windHash(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h = (h ^ (h >>> 16)) >>> 0;
  return (h >>> 8) / 16777216;
}

function windNoise(px: number, py: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = windHash(ix, iy);
  const b = windHash(ix + 1, iy);
  const c = windHash(ix, iy + 1);
  const d = windHash(ix + 1, iy + 1);
  const top = a + (b - a) * ux;
  const bottom = c + (d - c) * ux;
  return top + (bottom - top) * uy;
}

/**
 * The gust field at world (`x`, `z`), 0..1, blown downwind. `wind` is the
 * sky's WindState vec: xy the way the air moves, z its strength, w its clock.
 */
export function gustField(
  x: number,
  z: number,
  wind: ArrayLike<number>
): number {
  const drift = wind[3] * GUST_SPEED;
  const dx = wind[0] * drift;
  const dz = wind[1] * drift;
  const px = (x - dx) / GUST_LENGTH;
  const pz = (z - dz) / GUST_LENGTH;
  const ex = (x - dx * EDDY_DRIFT) / GUST_LENGTH;
  const ez = (z - dz * EDDY_DRIFT) / GUST_LENGTH;
  return (
    0.5 * windNoise(px, pz) +
    0.3 * windNoise(px * 2.7 + 37, pz * 2.7 + 91) +
    0.2 * windNoise(ex * 6.3 - 71, ez * 6.3 + 23)
  );
}

/** The field's value at which a gust starts to tell, and its height. Its
 *  mean is a half, so only its peaks count: a fixed point in full wind is in
 *  a gust about a quarter of the time, in bursts of a second or two. */
const GUST_LULL = 0.6;
const GUST_PEAK = 0.8;

/** 0..1: how hard the gust at a point of `field` (gustField) blows: 0 in the
 *  lulls, 1 at a gust's height. */
export function gustShare(field: number): number {
  return smoothstep(field, GUST_LULL, GUST_PEAK);
}
