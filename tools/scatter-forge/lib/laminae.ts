// Bedding laminae: the stack of beds a sedimentary rock was laid down in.
//
// Everything here is a function of one number, the distance along the bedding
// normal. That is what a bed is: rock laid down over a span of time, so it
// varies with depth and not across it. A bed runs the whole width of the rock,
// which is why this cannot be built from the 3D cellular fields the plates and
// the cracks use. Those give cells, and a cell has an extent in every
// direction.
//
// Two things come off each bed: its **tone**, which shifts the colour before
// the palette ramp so every other layer of the painter composites over a
// banded base, and its **hardness**, which stands the bed proud or lets it
// weather back. The second is most of what makes a bedded face read, because
// the beds a face shows are ribbed, not painted.
//
// The bands are warped by a slow 3D noise, so they undulate across the rock
// the way real bedding does. Without it a bed is a ruled line and reads as
// printed on.

import { fbm3r, hash3, smoothstep } from './noise.ts';

export interface LaminaField {
  /** Beds per metre along the bedding normal. */
  cells: number;
  /** How far bed thicknesses vary from one another, 0..1. */
  vary: number;
  /** Metres the bands wander along the bedding normal. */
  warp: number;
  /** Cycles per metre of that wander. */
  warpScale: number;
  /** Row-major rotation taking world space into the bedding frame, normal along y. */
  frame: number[];
  /** Share of beds that take the accent colour rather than the ramp, 0..1. */
  accentShare: number;
  /** How far a bed boundary is rounded, as a fraction of a bed, 0..1. */
  smoothing: number;
  seed: number;
}

export interface LaminaSample {
  /** The bed's own value, 0..1. Its tone comes off this. */
  id: number;
  /**
   * How far the bed stands proud, -0.5..0.5, blended across its boundaries so
   * the profile is ribbed rather than stepped. This is what the mesh takes.
   */
  hardness: number;
  /** 1 on a bedding plane, 0 in the body of a bed. The dark parting seam. */
  parting: number;
  /** 1 where the bed takes the accent colour, 0 where it takes the ramp. */
  accent: number;
}

/**
 * The widest a bed boundary strays from its lattice line, in beds. Under a
 * half, so two boundaries never cross and the beds stay in order however the
 * hashes fall.
 */
const JITTER = 0.45;

/** How wide the dark parting seam is, as a fraction of a bed. */
const PARTING = 0.06;

/** Band a bed's shoulder is rounded over at smoothing 1, as a fraction of a bed. */
const ROUND = 0.35;

/** Where the boundary below lattice line `c` sits, in beds. */
function boundaryAt(field: LaminaField, c: number): number {
  return c + (hash3(c, 0, 0, field.seed ^ 0x6c616d69) - 0.5) * 2 * JITTER * field.vary;
}

/** A bed's own value, constant along its whole run. */
function idAt(field: LaminaField, c: number): number {
  return hash3(c, 0, 0, field.seed ^ 0x62656473);
}

/** How far the bed below lattice line `c` stands proud, -0.5..0.5. */
function hardnessAt(field: LaminaField, c: number): number {
  return hash3(c, 0, 0, field.seed ^ 0x68617264) - 0.5;
}

/**
 * Where a world point sits in the bedding stack, in beds. The point is taken
 * into the bedding frame and then pushed along the normal by a slow noise, so
 * a band swells and sags across the rock instead of running level.
 */
function depthAt(field: LaminaField, x: number, y: number, z: number): number {
  const f = field.frame;
  const t = f[3] * x + f[4] * y + f[5] * z;

  if (field.warp > 0) {
    const s = field.warpScale;
    const wobble = (fbm3r(x * s, y * s, z * s, 3, field.seed ^ 0x77617270) - 0.5) * field.warp;
    return (t + wobble) * field.cells;
  }

  return t * field.cells;
}

/**
 * The bed under a world point, written into `into`.
 *
 * The lattice line a point falls on is not the bed it is in, because the
 * boundaries are jittered. Three lines are enough to find it: the jitter is
 * under half a bed either way, so the true boundary is never further than one
 * line from the one the point rounds to.
 */
export function laminaInto(into: LaminaSample, field: LaminaField, x: number, y: number, z: number): LaminaSample {
  const t = depthAt(field, x, y, z);
  let c = Math.floor(t);

  // Walk to the bed that actually holds the point.
  if (t < boundaryAt(field, c)) c -= 1;
  else if (t >= boundaryAt(field, c + 1)) c += 1;

  const low = boundaryAt(field, c);
  const high = boundaryAt(field, c + 1);
  const thickness = Math.max(1e-4, high - low);
  // 0 at the bed's floor, 1 at its ceiling.
  const u = (t - low) / thickness;

  into.id = idAt(field, c);

  // The hardness is blended into the neighbouring bed over a band at each
  // boundary, so a hard bed meets a soft one on a shoulder. A hard step here
  // is a hard crease in the mesh, which no weathered rock has.
  const round = Math.max(1e-3, field.smoothing * ROUND);
  const own = hardnessAt(field, c);
  const below = hardnessAt(field, c - 1);
  const above = hardnessAt(field, c + 1);
  const toFloor = smoothstep(0, round, u);
  const toCeiling = 1 - smoothstep(1 - round, 1, u);
  into.hardness = own * toFloor * toCeiling + (below * (1 - toFloor) + above * (1 - toCeiling)) * 0.5;

  // The parting seam, at both of this bed's boundaries.
  const edge = Math.min(u, 1 - u);
  into.parting = 1 - smoothstep(0, PARTING, edge);

  // A bed takes the accent whole or not at all, feathered only at its edges so
  // the seam does not alias.
  into.accent = field.accentShare > 0 && idAt(field, c) < field.accentShare ? toFloor * toCeiling : 0;

  return into;
}

const _sample: LaminaSample = { id: 0, hardness: 0, parting: 0, accent: 0 };

/**
 * How far the surface moves at a point, -0.5..0.5, for the mesh alone.
 *
 * Only the hardness, because that is the only part of a bed the geometry can
 * carry. A bed thinner than a mesh quad has to stay in the texture, the way a
 * fine crack does.
 */
export function laminaRelief(field: LaminaField, x: number, y: number, z: number): number {
  return laminaInto(_sample, field, x, y, z).hardness;
}
