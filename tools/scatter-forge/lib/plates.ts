// A pile of bevelled slabs, as a 3D field. Rock breaks along planes, and an
// octave sum has none, so the relief that reads as rock is this: every cell
// of a lattice holds one slab, oversized so it overlaps its neighbours, flat
// on top with a bevel to its edge and a lean across it, and the field is the
// highest slab at a point. A surface cutting the pile shows plates on faces
// along the bedding and bands on faces across it.
//
// Finer layers are min-blended in, so their gaps chip the coarse plates and
// their bevels ride on top of them.

import { hash3 } from './noise.ts';
import type { Rng } from './rng.ts';
import type { Vec3 } from './vec.ts';

export interface PlateField {
  /** Coarse slab cells per metre. */
  cells: number;
  /** Layers of slabs, each 1.7x finer than the last, min-blended. */
  layers: number;
  /** Fraction of a slab's half width that slopes to its edge. */
  bevel: number;
  /** How far a slab drops across its own width, 0..1 of its height. */
  lean: number;
  /** How far the slabs are flattened and aligned into strata, 0..1. */
  bedding: number;
  /** Row-major rotation taking world space into the bedding frame, bedding normal along y. */
  frame: number[];
  seed: number;
}

export interface PlateSample {
  /** 1 on a slab's top, 0 in a gap between slabs. */
  height: number;
  /** The coarse slab's own random value, 0..1, constant across it. */
  id: number;
}

/** Layers finer than the first, in cells per metre relative to it. */
const LAYER_STEP = 1.7;
/** How much thinner cells are along the bedding normal at full bedding. */
const FLATTEN = 1.5;
/** Half width of a slab in cells: past a whole cell, so every point is under a slab or two. */
const HALF_MIN = 0.85;
const HALF_RANGE = 0.35;
/** How far a slab's centre strays from its cell's, in cells. */
const JITTER = 0.25;
/** Radians a slab may turn from the bedding at bedding 0. */
const SPREAD = Math.PI / 3;
/** How deep each finer layer chips, relative to the one before it. */
const CHIP = 0.5;

/** A per-rock bedding frame: up, tilted by up to `tilt` radians about a random horizontal axis. */
export function beddingFrame(rng: Rng, tilt: number): number[] {
  const angle = rng.range(0, tilt);
  const about = rng.range(0, Math.PI * 2);
  const ax = Math.cos(about);
  const az = Math.sin(about);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  // Rodrigues about the horizontal axis (ax, 0, az), transposed so it maps
  // the tilted normal back onto y.
  return [
    c + ax * ax * t, az * s, ax * az * t,
    -az * s, c, ax * s,
    ax * az * t, -ax * s, c + az * az * t,
  ];
}

const _q: Vec3 = [0, 0, 0];
const _local: Vec3 = [0, 0, 0];

/** One layer's height at a point already in the flattened bedding frame. */
function layerAt(field: PlateField, x: number, y: number, z: number, seed: number, wantId: boolean, out: PlateSample): number {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const cz = Math.floor(z);
  const spread = (1 - field.bedding) * SPREAD;
  let best = -Infinity;
  let bestId = 0;

  for (let oz = -1; oz <= 1; oz++)
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox;
        const gy = cy + oy;
        const gz = cz + oz;

        const half = HALF_MIN + hash3(gx, gy, gz, seed ^ 0x2545f491) * HALF_RANGE;
        _local[0] = x - (gx + 0.5 + (hash3(gx, gy, gz, seed) - 0.5) * JITTER);
        _local[1] = y - (gy + 0.5 + (hash3(gx, gy, gz, seed ^ 0x9e3779b9) - 0.5) * JITTER);
        _local[2] = z - (gz + 0.5 + (hash3(gx, gy, gz, seed ^ 0x3c6ef372) - 0.5) * JITTER);

        // Each slab turned from the bedding by up to `spread`, about its own axis.
        if (spread > 0) {
          const angle = (hash3(gx, gy, gz, seed ^ 0x27d4eb2d) - 0.5) * 2 * spread;
          const u = hash3(gx, gy, gz, seed ^ 0x165667b1) * 2 - 1;
          const phi = hash3(gx, gy, gz, seed ^ 0x7f4a7c15) * Math.PI * 2;
          const ring = Math.sqrt(1 - u * u);
          const kx = Math.cos(phi) * ring;
          const ky = u;
          const kz = Math.sin(phi) * ring;
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          const d = (kx * _local[0] + ky * _local[1] + kz * _local[2]) * (1 - c);
          const rx = _local[0] * c + (ky * _local[2] - kz * _local[1]) * s + kx * d;
          const ry = _local[1] * c + (kz * _local[0] - kx * _local[2]) * s + ky * d;
          const rz = _local[2] * c + (kx * _local[1] - ky * _local[0]) * s + kz * d;
          _local[0] = rx;
          _local[1] = ry;
          _local[2] = rz;
        }

        const ax = Math.abs(_local[0]) / half;
        const ay = Math.abs(_local[1]) / half;
        const az = Math.abs(_local[2]) / half;
        const edge = Math.max(ax, ay, az);

        // Flat top, bevelled to the edge, dropping across the slab's width. The
        // bevel carries on below zero past the edge, so a point no slab covers
        // sits in a narrow V between its neighbours rather than on a flat pit.
        const top = Math.min(1, (1 - edge) / Math.max(1e-3, field.bevel));
        const value = top - field.lean * (_local[0] / half + 1) * 0.5;
        if (value > best) {
          best = value;
          if (wantId) bestId = hash3(gx, gy, gz, seed ^ 0x51ed270b);
        }
      }

  if (wantId) out.id = bestId;
  return Math.max(0, best);
}

/** The pile's height and the coarse slab under a world point. */
export function platesInto(out: PlateSample, field: PlateField, x: number, y: number, z: number): PlateSample {
  const f = field.frame;
  _q[0] = f[0] * x + f[1] * y + f[2] * z;
  _q[1] = (f[3] * x + f[4] * y + f[5] * z) * (1 + field.bedding * FLATTEN);
  _q[2] = f[6] * x + f[7] * y + f[8] * z;

  let height = 1;
  let scale = field.cells;
  let depth = 1;
  for (let layer = 0; layer < field.layers; layer++) {
    const value = layerAt(field, _q[0] * scale, _q[1] * scale, _q[2] * scale, field.seed + layer * 7919, layer === 0, out);
    height = Math.min(height, 1 - (1 - value) * depth);
    scale *= LAYER_STEP;
    depth *= CHIP;
  }

  out.height = height;
  return out;
}
