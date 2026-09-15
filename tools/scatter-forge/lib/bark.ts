// Bark as a stack of layers rather than one expression.
//
// No single field is bark. An oak is flat plates at differing levels, split by
// deep fissures that run along the trunk and shallow ones that interrupt them,
// with a crust of flakes over the exposed faces and a knot every so often. A
// birch is none of that. So a profile names an ordered stack, each layer writes
// the fields it owns, and a species is a table row rather than a rewrite.
//
// Layers write into a sample the caller owns and reuses. The bark band is half
// a million texels and a stack reads several cellular fields at each, so a
// fresh object per texel per layer is the whole budget.

import { fbm, warpInto, worleyInto, type WorleyResult } from './noise.ts';
import { hash2 } from './rng.ts';
import type { Params } from './params.ts';

/** Everything a bark stack knows about one texel. */
export interface BarkSample {
  /** Lookup coordinate: 0..1 along the branch, 0..1 around the ring. Layers
   *  that deform the bark displace this, so later layers flow with them. */
  u: number;
  v: number;
  /** Surface height, 0..1. */
  height: number;
  /** 0 on an exposed face, 1 at the bottom of a fissure. Drives occlusion and
   *  how dark colour goes, which absolute height cannot: a low plate is not a
   *  crevice, and shading from depth alone is what makes a generated map read
   *  as a tinted heightfield. */
  cavity: number;
  /** Per-plate random, constant across a plate. 0.5 where there are no plates. */
  plate: number;
  /** Fine tone at texel scale, 0..1. */
  grain: number;
  /** Dead or damaged tissue, 0..1. Knot cores. */
  wear: number;
  /** A signed height offset staged by an early layer and settled once the
   *  structure it deforms has been drawn. A layer that displaces the lookup
   *  coordinate has to run before the layers reading it and finish after them. */
  lift: number;
}

export interface BarkLayer {
  /** Mutates the sample in place. Never allocates. */
  apply(sample: BarkSample): void;
}

export function createSample(): BarkSample {
  return { u: 0, v: 0, height: 0, cavity: 0, plate: 0.5, grain: 0.5, wear: 0, lift: 0 };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Plates and fissures
// ---------------------------------------------------------------------------

export interface PlateConfig {
  /** Cells along the branch. Fewer makes longer plates and longer fissures. */
  along: number;
  /** Cells around the ring. This is `barkPlates`. */
  around: number;
  /** How far a fissure cuts where it runs along the trunk. */
  alongDepth: number;
  /** The same where it runs across it, as a fraction of `alongDepth`. */
  crossRatio: number;
  /** Half-width of a fissure, in the units of `f2 - f1`. */
  width: number;
  /** How far plate tops sit above and below each other. */
  step: number;
  /** How far a fissure wanders sideways, in cells. */
  wander: number;
  /** How far the cell edges are broken up, in cells. */
  roughen: number;
  /** The bark image's size in texels, along the branch by around the ring.
   *  Everything the eye judges — how wide a cut is, which way it runs — is a
   *  property of the image, and the cell lattice is far from square, so nothing
   *  may be measured in cells. */
  bandWidth: number;
  bandHeight: number;
}

/**
 * The structural layer: a partition into plates, cut apart by fissures.
 *
 * Two things make this read as oak rather than as crazed mud.
 *
 * The first is that a plate is a **shelf at its own level**, not a dome. Its
 * height comes from the cell's own random value, which is constant across the
 * plate and jumps at the border — and the border is exactly where the fissure
 * is, so the jump is never seen. It is faded out by the fissure wall anyway, so
 * two plate tops meet at the bottom of the crack between them rather than
 * stepping against each other over one texel.
 *
 * The second is that fissure depth follows the **direction of the border**,
 * taken from the vector between the two feature points that own it. An oak's
 * long fissures run up the trunk and the cross cracks only interrupt them, and
 * that is one field asked which way it points — not two networks laid over each
 * other, which is what makes a fishnet.
 */
export function plateLayer(config: PlateConfig, seed: number): BarkLayer {
  const { along: PX, around: PY } = config;
  const cell: WorleyResult = { f1: 0, f2: 0, id: 0, nx: 0, ny: 0 };

  // The lookup point, and the same one texel along each axis. Owned by the
  // layer, because this runs at every texel of the band.
  const here: number[] = [0, 0];
  const rightward: number[] = [0, 0];
  const downward: number[] = [0, 0];

  const du = 1 / config.bandWidth;
  const dv = 1 / config.bandHeight;

  // In texels, from a fraction of a cell's height — the width an along-trunk
  // cut already had, and now the width of every cut.
  const halfWidth = (config.width * config.bandHeight) / (2 * PY);

  /** Where a point of the band lands in the cell lattice. */
  function deform(bu: number, bv: number, into: number[]): void {
    // A shear, not a warp. Displacing v by a field that varies mostly along the
    // trunk slides whole lanes sideways, which is the wander a fissure has.
    const shear =
      (fbm(bu * 4, bv * 3, 4, 3, 2, seed + 9) * 2 - 1) * config.wander +
      (fbm(bu * 12, bv * 6, 12, 6, 2, seed + 13) * 2 - 1) * config.wander * 0.4;

    // A little symmetric warp on top, or the cells keep their straight Worley
    // edges and the plates read as cut polygons.
    warpInto(into, bu * PX, bv * PY, PX, PY, seed + 5, config.roughen, 3);
    into[1] += shear;
  }

  return {
    apply(s) {
      const { u, v } = s;

      // Sampled three times, so the deformation's own Jacobian is available.
      // The lattice is six times wider than it is tall in texels and the warp
      // stretches it further, unevenly — so a distance in the lattice is not a
      // distance on the trunk, and a width measured without this leaves one cut
      // a hairline and the next a smear.
      deform(u, v, here);
      deform(u + du, v, rightward);
      deform(u, v + dv, downward);

      worleyInto(cell, here[0], here[1], PX, PY, seed + 31);

      // The exact distance to the border the two feature points share, not
      // f2 - f1. That difference is not a distance: its gradient collapses
      // wherever the two points subtend a narrow angle, which is every cell
      // corner, so one threshold on it holds a few texels along an edge and
      // spreads into a broad smear at every junction between them. This has
      // the same gradient everywhere, so one width means one width.
      const separation = Math.hypot(cell.nx, cell.ny) || 1;
      const nx = cell.nx / separation;
      const ny = cell.ny / separation;
      const distance = (cell.f2 * cell.f2 - cell.f1 * cell.f1) / (2 * separation);

      // The border field's gradient per texel, which is the Jacobian applied to
      // that border's normal. Its length is what converts the distance above
      // into texels, and its direction is the direction the cut runs — both
      // after the warp rather than before it.
      const gx = (rightward[0] - here[0]) * nx + (rightward[1] - here[1]) * ny;
      const gy = (downward[0] - here[0]) * nx + (downward[1] - here[1]) * ny;
      const perTexel = Math.hypot(gx, gy) || 1e-9;

      const border = distance / perTexel;
      const alongness = Math.abs(gy) / perTexel;

      // Every cell border is a border, but not every border is a fissure. Left
      // unmasked they all cut alike and the trunk reads as a net.
      const cut = 0.35 + 0.65 * smoothstep(0.34, 0.66, fbm(u * 8, v * 4, 8, 4, 3, seed + 37));
      const depth = config.alongDepth * mix(config.crossRatio, 1, alongness * alongness) * cut;

      // One width for every cut, and one cross-section: a crease at the bottom
      // opening into a gradual fade. Only the depth varies. A width that varies
      // on its own is what makes some cuts read as a line and others as a
      // smudge, because a shallow cut spread wide has no edge anywhere in it.
      //
      // grooveWidth stays a fraction of a cell's height, so it means the
      // same at any textureSize, and now means it in every direction.
      const t = clamp01(border / halfWidth);

      // (1 - t)^2, so the profile is steepest where the cut is deepest and
      // flattens as it opens out. Its slope at the bottom is what draws the
      // line: a curve that arrives flat there — a smoothstep — bottoms out in a
      // plateau, and a plateau is a blur however deep it goes.
      const groove = (1 - t) * (1 - t);

      // The plate's own level is faded out by a curve that *is* flat at the
      // bottom, which is the opposite requirement: the level jumps from plate
      // to plate and this is what buries the jump in the crease.
      const wall = t * t * (3 - 2 * t);

      // A face is not a facet. Without this the cells read as the flat polygons
      // they are, and the straight edges between two of them are the one thing
      // that says cellular noise out loud.
      const undulation = 0.06 * (fbm(u * 10, v * 26, 10, 26, 3, seed + 83) - 0.5);

      s.plate = cell.id;
      s.cavity = clamp01(groove * (depth / Math.max(config.alongDepth, 1e-4)));
      s.height = clamp01(
        0.62 + (config.step * (cell.id - 0.5) + undulation) * wall - depth * groove
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Crust
// ---------------------------------------------------------------------------

/**
 * The flaking on an exposed face.
 *
 * Cells again, and small ones, because the thing being drawn is chips. A high
 * frequency ridged sum is the obvious alternative and it reads as brushed metal
 * however hard it is warped: it has no edges, and a flake is all edge.
 *
 * Masked by what is already a face, so the crust does not fill the fissures it
 * is supposed to sit between.
 */
export function crustLayer(strength: number, seed: number): BarkLayer {
  // Elongated along the branch, the way a flake lifts off. Square chips read as
  // crocodile skin, which is the giveaway of a cellular field left isotropic.
  const FX = 45;
  const FY = 52;
  const chip: WorleyResult = { f1: 0, f2: 0, id: 0, nx: 0, ny: 0 };

  return {
    apply(s) {
      if (strength <= 0) return;

      // Patchy, because bark flakes where it has weathered and stays smooth
      // where it has not. Spread evenly it is one texture over the whole trunk
      // and reads as a material rather than as wear.
      const cover = smoothstep(0.36, 0.62, fbm(s.u * 5, s.v * 9, 5, 9, 3, seed + 67));
      if (cover <= 0) return;

      worleyInto(chip, s.u * FX, s.v * FY, FX, FY, seed + 71);

      const relief = (chip.id - 0.5) - smoothstep(0, 0.2, chip.f2 - chip.f1) * 0.3;
      s.height = clamp01(s.height + strength * relief * cover * (1 - s.cavity));
    },
  };
}

// ---------------------------------------------------------------------------
// Grain
// ---------------------------------------------------------------------------

/** Texel-scale tone and the last of the relief. */
export function grainLayer(seed: number): BarkLayer {
  return {
    apply(s) {
      const value = fbm(s.u * 40, s.v * 160, 40, 160, 2, seed + 91);
      s.grain = value;
      s.height = clamp01(s.height + 0.015 * (value - 0.5));
    },
  };
}

// ---------------------------------------------------------------------------
// Knots
// ---------------------------------------------------------------------------

// A knot sits somewhere in one of these cells, jittered. Wrapped the same way
// the noise lattices are, so a knot straddling the seam appears on both sides.
//
// The grid sets the knots' scale, because `knotSize` is a fraction of a
// cell. Coarse cells give knots that swallow the plate structure they are
// supposed to interrupt, which is a quarter of the trunk each.
const KNOT_COLS = 9;
const KNOT_ROWS = 7;

// Knot radii beyond which nothing is displaced. Must match the falloff, or the
// cutoff itself becomes the discontinuity it was meant to avoid.
const KNOT_RANGE = 2;

/**
 * Knots, and the way the bark flows past them.
 *
 * This runs first in a stack, because what sells a knot is not the knot but the
 * plates and fissures **bending around** it. It displaces the coordinate every
 * later layer reads at, so the whole pattern flows past rather than running
 * through, and then adds the collar the bark healed over the stub with.
 *
 * One rule if you extend this: **never read a per-knot value from the nearest
 * knot.** Any such value jumps wherever the nearest one changes, and the jump
 * draws a hard straight line clean across the trunk that is far more obvious
 * than the knots are. Accumulate over every knot in range instead, with a
 * falloff that reaches exactly zero at the cutoff, and zero again at the centre
 * where the outward direction is undefined.
 *
 * That is the opposite of what `plateLayer` does with a cell's own value, and
 * the difference is where the discontinuity lands: a plate's lands in the
 * fissure that hides it, a knot's lands in open bark.
 */
export function knotLayer(params: Params, seed: number): BarkLayer {
  return {
    apply(s) {
      if (params.knots <= 0) return;

      const gx = s.u * KNOT_COLS;
      const gy = s.v * KNOT_ROWS;
      const cellX = Math.floor(gx);
      const cellY = Math.floor(gy);

      let core = 0;
      let relief = 0;
      let weight = 0;
      let pushX = 0;
      let pushY = 0;

      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = cellX + ox;
          const cy = cellY + oy;
          const wx = ((cx % KNOT_COLS) + KNOT_COLS) % KNOT_COLS;
          const wy = ((cy % KNOT_ROWS) + KNOT_ROWS) % KNOT_ROWS;
          const key = wx * 31 + wy;

          if (hash2(seed ^ 0x4b1d3f, key) > params.knots) continue;

          const px = cx + 0.25 + hash2(seed ^ 0x7f4a, key) * 0.5;
          const py = cy + 0.25 + hash2(seed ^ 0x2c19, key) * 0.5;

          // Elongated along the branch, which is the u axis. Bark grows past a
          // knot rather than around it, and the band's texels are wider than
          // they are tall, so both reasons pull the same way.
          const dx = (gx - px) / 1.8;
          const dy = gy - py;
          const span = Math.hypot(dx, dy);
          const distance = span / params.knotSize;
          if (distance >= KNOT_RANGE) continue;

          const mask = 1 - smoothstep(1, KNOT_RANGE, distance);
          const middle = 1 - smoothstep(0, 0.62, distance);

          // A raised collar where the bark healed over the stub, a sunken
          // middle, and the rings of the branch showing through around it.
          const rings =
            0.5 + 0.5 * Math.cos(distance * Math.PI * (4 + Math.round(hash2(seed ^ 0x51ab, key) * 4)));
          const collar = Math.exp(-((distance - 0.95) ** 2) * 7);

          core = Math.max(core, middle);
          relief += (0.3 * collar + 0.1 * rings * (1 - middle) - 0.5 * middle) * mask;
          weight += mask;

          // Pushed outward, so the plates sampled here are the ones that belong
          // further in. That is what makes the grain flow around a knot rather
          // than run straight through it, and it is the whole tell.
          const profile =
            smoothstep(0, 0.35, distance) *
            Math.exp(-((distance - 0.95) ** 2) * 2) *
            (1 - smoothstep(1.2, KNOT_RANGE, distance));

          if (profile <= 0) continue;
          const shove = (profile * params.knotDepth * 0.4) / Math.max(span, 1e-4);
          pushX += (dx * shove) / KNOT_COLS;
          pushY += (dy * shove) / KNOT_ROWS;
        }
      }

      if (weight <= 0) return;

      s.u += pushX;
      s.v += pushY;
      s.wear = core;
      // A signed offset staged for later, not a height blended over the bark.
      // Replacing the bark is what turns a knot into a bullseye: the plates and
      // fissures stop at its edge instead of climbing the collar and dropping
      // into the dead middle, which is what they do on a real trunk.
      s.lift = (relief / weight) * Math.min(1, weight) * params.knotDepth;
    },
  };
}

/** Settles whatever an earlier layer staged over the structure drawn since. */
export function liftLayer(): BarkLayer {
  return {
    apply(s) {
      if (s.lift === 0) return;
      s.height = clamp01(s.height + s.lift);
      s.cavity = clamp01(Math.max(s.cavity, s.wear * 0.6));
    },
  };
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** How a named profile shapes the plates, before the look values override it. */
export interface BarkProfile {
  along: number;
  crossRatio: number;
  wander: number;
  roughen: number;
  /** Multiplies `barkCrust`, so one value reads the same across profiles. */
  crust: number;
}

export const BARK_PROFILES: Record<string, BarkProfile> = {
  // Long deep fissures up the trunk, shallow interruptions across it, flat
  // crusty plates between. Oak, ash, elm.
  oak: { along: 6, crossRatio: 0.2, wander: 1.1, roughen: 0.32, crust: 1 },
  // Barely parted plates and no crust: beech, hornbeam, young growth.
  smooth: { along: 3, crossRatio: 0.6, wander: 0.5, roughen: 0.4, crust: 0.15 },
};

export function profileNames(): string[] {
  return Object.keys(BARK_PROFILES);
}

/**
 * The bark image's size in texels, along the branch by around the ring.
 *
 * Bark owns its whole image now, so both are the full edge. A profile still
 * spreads far fewer cells along the branch than around it, so a cell comes out
 * several times longer than it is wide, and nothing the eye judges may be
 * measured in cells without this.
 */
function bandSize(params: Params): { width: number; height: number } {
  return { width: params.textureSize, height: params.textureSize };
}

/** The layer stack a parameter set asks for, built once per texture. */
export function barkStack(params: Params, seed: number): BarkLayer[] {
  const profile = BARK_PROFILES[params.barkProfile];
  if (!profile) throw new Error(`Unknown barkProfile '${params.barkProfile}'.`);
  const band = bandSize(params);

  return [
    plateLayer(
      {
        along: profile.along,
        around: params.barkPlates,
        alongDepth: params.grooveDepth,
        crossRatio: profile.crossRatio,
        width: params.grooveWidth,
        step: params.barkStep,
        wander: profile.wander * params.grooveWander,
        roughen: profile.roughen,
        bandWidth: band.width,
        bandHeight: band.height,
      },
      seed
    ),
    crustLayer(params.barkCrust * profile.crust, seed),
    knotLayer(params, seed),
    grainLayer(seed),
    liftLayer(),
  ];
}

/** Runs a stack at one point of the band. */
export function sampleBark(stack: BarkLayer[], sample: BarkSample, u: number, v: number): BarkSample {
  sample.u = u;
  sample.v = v;
  sample.height = 0;
  sample.cavity = 0;
  sample.plate = 0.5;
  sample.grain = 0.5;
  sample.wear = 0;
  sample.lift = 0;

  for (const layer of stack) layer.apply(sample);
  return sample;
}
