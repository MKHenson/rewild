// Accents: cards hung plumb off a model. A fern's fertile spire, a poplar's
// catkins and a palm's skirt of dead fronds are the same thing — a second
// population of cutout cards, off their own stamps, oriented against gravity
// rather than against whatever they are attached to. `pitch` is the whole
// difference between them: 0 stands, 180 hangs.
//
// A type supplies the sites — where on itself a card may leave from — and this
// builds the cards. The tree offers its leaf twigs or its forks, the crown its
// rosette down the same span its fronds take, the clump each tuft's centre.
// The cards are written into the host's cutout piece and address cells the
// host's atlas set aside for them, so they cost no draw and no image.

import { columnOf, type UvRect } from './atlas.ts';
import { pushVertex, type Builder } from './builder.ts';
import type { AccentSpec, Params } from './params.ts';
import { createRng, hash2, type Rng } from './rng.ts';
import { add, cross, normalize, rotateAbout, scale, type Vec3 } from './vec.ts';

const DEG = Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TWO_PI = Math.PI * 2;
const UP: Vec3 = [0, 1, 0];

/** One place a card may leave from. */
export interface AccentSite {
  p: Vec3;
  /** How far out of `p` the host's surface is. The card's base sits there. */
  radius: number;
  /** Path distance from the root, which the bend weight is measured off. */
  dist: number;
  /** The host's sway phase, COLOR_0.g, so the card rides what it hangs from. */
  phase: number;
  /** Stable per site, so its cell and flutter phase survive a re-run. */
  key: number;
}

/** What the host decides about a card once its site and facing are known. */
export interface AccentHost {
  /** COLOR_0.r at `along` metres past the site, `t` of the way up the card. */
  bend(site: AccentSite, along: number, t: number): number;
  /** The shading normal, given the way the card faces and its own face normal. */
  normal(site: AccentSite, outward: Vec3, face: Vec3): Vec3;
}

/**
 * Cards one site gets from `count` per site: the whole part, plus one more by
 * the fraction's chance. Fruit is sparse, and 0.3 of a card per twig is the
 * number that says so.
 */
export function cardsAt(count: number, rng: Rng): number {
  const whole = Math.floor(count);
  return whole + (rng() < count - whole ? 1 : 0);
}

/** The rng an accent's sites are dealt with, apart from the host's own so
 *  that adding an accent moves nothing the host already placed. */
export function accentRng(params: Params, index: number): Rng {
  return createRng(params.seed ^ 0x3c6ef372 ^ (index * 0x9e3779b1));
}

/**
 * One card per site, written into `out`.
 *
 * The card leaves the host's surface and turns `pitch` from world up about a
 * horizontal axis, bowing on toward the ground by `curve` over its length —
 * the frond's walk, measured from the sky rather than from the rosette. Its
 * plane is spanned by that direction and the horizontal across it, so a
 * standing card faces outward and a hanging one faces out from under whatever
 * it hangs from. The stamp's bottom-middle lands on the site whichever way
 * the card points, which is the whole of the source contract.
 */
export function buildAccent(
  out: Builder,
  params: Params,
  index: number,
  spec: AccentSpec,
  sites: AccentSite[],
  cells: UvRect[],
  host: AccentHost
): void {
  if (!sites.length || !cells.length) return;

  const rng = createRng(params.seed ^ 0x5a17c3e9 ^ (index * 0x9e3779b1));
  const azimuth = rng() * TWO_PI;

  sites.forEach((site, i) => {
    // Round by the golden angle from a random start and jittered, for the
    // reason a tuft's cards are: an even fraction of a turn reads as machined.
    const yaw = azimuth + GOLDEN_ANGLE * i + rng.range(-0.3, 0.3);
    const outward: Vec3 = [Math.cos(yaw), 0, Math.sin(yaw)];
    const side = normalize(cross(UP, outward));

    const pitch = spec.pitch + rng.range(-spec.variance, spec.variance);
    const length = spec.length * rng.range(0.8, 1);
    const halfWidth = (length * spec.aspect) / 2;
    const base = add(site.p, scale(outward, site.radius));

    const cell = columnOf(cells[Math.floor(hash2(params.seed, site.key * 977 + index) * cells.length) % cells.length], spec.aspect);
    const cardPhase = hash2(params.seed ^ 0x2545f491, site.key * 31 + index);

    const directionAt = (t: number): Vec3 => normalize(rotateAbout(UP, side, (pitch + spec.curve * t * t) * DEG));
    const normal = host.normal(site, outward, normalize(cross(side, directionAt(0))));

    // Walked rather than solved, so the card's length is its arc length.
    let point = base;
    const rowStart: number[] = [];

    for (let k = 0; k <= spec.segments; k++) {
      const t = k / spec.segments;
      if (k > 0) point = add(point, scale(directionAt(t), length / spec.segments));

      rowStart.push(out.positions.length / 3);
      const bend = host.bend(site, t * length, t);

      for (const across of [-1, 1]) {
        pushVertex(
          out,
          add(point, scale(side, across * halfWidth)),
          normal,
          [cell.u0 + (across * 0.5 + 0.5) * (cell.u1 - cell.u0), cell.v1 - t * (cell.v1 - cell.v0)],
          // Flutter rises to the tip like the bend does, scaled down for a card
          // that is heavier or stiffer than a leaf.
          [bend, site.phase, t * spec.flutter, cardPhase]
        );
      }
    }

    // Wound the way a frond is, so the front face is the one the card faces.
    for (let k = 0; k < spec.segments; k++) {
      const a = rowStart[k];
      const b = rowStart[k + 1];
      out.indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  });
}
