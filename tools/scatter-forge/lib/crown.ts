// A crown: one undivided stem carrying a rosette of long curved cards. A palm
// is the stem case and a fern is the stemless one; both are one rosette, and
// that is the whole reason they share a type rather than being a palm mode of
// `tree` and a fern mode of `clump`.
//
// The stem is a single branch on a skeleton of its own, so the tree's bark
// builder, collider and impostor all take it unchanged. The fronds are the
// clump's segmented cards, placed at one height instead of fanned from the
// ground, and phased with the stem so the rosette rides its sway.

import { columnOf, leafCells } from './atlas.ts';
import {
  buildBark,
  createBuilder,
  finish,
  pushVertex,
  type BarkTile,
  type ForgeMesh,
  type MeshAttributes,
} from './mesh.ts';
import { hasStem, trunkRingsOf, type Params } from './params.ts';
import { createRng, hash2, type Rng } from './rng.ts';
import {
  bendWeight,
  clusterPhase,
  sampleBranch,
  wanderCentreLine,
  type Branch,
  type BranchPoint,
  type Skeleton,
} from './skeleton.ts';
import { add, cross, normalize, perpendicular, rotateAbout, scale, type Vec3 } from './vec.ts';

const DEG = Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TWO_PI = Math.PI * 2;
const UP: Vec3 = [0, 1, 0];

/** What the emitted layer and the report are measured off. */
export interface CrownMetrics {
  /** Metres to the topmost vertex. */
  height: number;
  /** Radius about the vertical axis, which is what the placer keeps clear. */
  spread: number;
  stemHeight: number;
  frondLength: number;
  fronds: number;
}

export interface Crown {
  mesh: ForgeMesh;
  /** The stem as a one-branch skeleton. Null where there is no stem. */
  skeleton: Skeleton | null;
  metrics: CrownMetrics;
}

/** Where the rosette sits, and which way it points. */
interface Rosette {
  p: Vec3;
  dir: Vec3;
  radius: number;
  dist: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * The stem's radius at `t` up its length: the trunk's taper, flared at the
 * foot and swollen under the crown.
 *
 * The foot takes `trunkFlare`, the same key a trunk does, and defaults to 0.25
 * here where a trunk defaults to none: a bare pole is what a tree's trunk
 * mostly is and what a palm's stem never is. It is gone by a quarter of the way
 * up, against a fifth on a trunk, because a stem is seven metres and a trunk is
 * forty. The bulge rises over the top
 * third to peak just under the rosette, then comes back in by half, so it
 * reads as a swelling rather than as a wider tube — a palm's crownshaft is
 * fatter than the stem below it and the fronds leave from its shoulder.
 */
function stemRadiusAt(params: Params, t: number): number {
  const taper = params.trunkTaper + (1 - params.trunkTaper) * (1 - t) ** 1.3;
  const flare = params.trunkFlare * (1 - smoothstep(0, 0.25, t));
  const bulge = params.crownBulge * smoothstep(0.6, 0.88, t) * (1 - 0.5 * smoothstep(0.88, 1, t));
  return params.trunkRadius * (taper + flare + bulge);
}

/**
 * The stem's centre line: rings climbing from the origin, leaning further
 * with every step.
 *
 * The lean eases in as the square of the height rather than accruing evenly,
 * because that is the shape of a palm: the lower trunk stands near vertical
 * and the bend gathers toward the crown. One fixed axis for the whole stem,
 * for the reason a branch uses one — a fresh axis per ring averages back to
 * straight and reads as a wobble.
 */
function growStem(params: Params, rng: Rng): Branch {
  const rings = trunkRingsOf(params);
  const step = params.stemHeight / (rings - 1);
  const tipRadius = stemRadiusAt(params, 1);
  const leanAxis = rotateAbout(perpendicular(UP), UP, rng() * TWO_PI);

  const points: BranchPoint[] = [];
  let position: Vec3 = [0, 0, 0];
  let distance = 0;

  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const heading = normalize(rotateAbout(UP, leanAxis, params.stemLean * DEG * t * t));
    points.push({ p: position, radius: stemRadiusAt(params, t), dist: distance, dir: heading });
    if (i === rings - 1) break;

    // Stepped along the heading at the next ring, so the stem's length is its
    // arc length and a leaning palm does not come out short.
    const next = normalize(rotateAbout(UP, leanAxis, params.stemLean * DEG * ((i + 1) / (rings - 1)) ** 2));
    position = add(position, scale(next, step));
    distance += step;
  }

  const stem: Branch = {
    id: 0,
    level: 0,
    clusterId: 0,
    points,
    length: params.stemHeight,
    baseRadius: params.trunkRadius,
    tipRadius,
    children: [],
  };

  // The same stray a trunk takes. `stemLean` bends the stem one way over its
  // whole height, which is the palm's arc; this is the unevenness on top of it.
  // The rosette rides the stem's top point, so it follows without being told.
  if (params.trunkWander > 0) wanderCentreLine(params, stem);

  return stem;
}

/**
 * How far a frond has turned from the stem's axis at `t` along its length.
 *
 * It leaves at `frondAngle` above horizontal and bows by `cardCurve` over its
 * length, quadratically, so it holds its line near the base and droops toward
 * the tip — the same shape a blade takes, at ten times the size.
 */
function tiltAt(params: Params, pitch: number, t: number): number {
  return (90 - pitch + params.cardCurve * t * t) * DEG;
}

/** The rosette's shading normal: up, leaned outward. See tuftNormal in clump.ts. */
function rosetteNormal(params: Params, outward: Vec3): Vec3 {
  return normalize(add(scale(outward, params.normalLean), UP));
}

/**
 * Where frond `index` of `count` attaches, as a fraction of the crown's depth
 * from the top. 0 is the top; only a crown with a span and a stem goes below it.
 *
 * Depth is age. A palm grows from its tip, so the fronds lowest on the stem
 * are the oldest, and those are the ones that hang.
 */
function depthOf(params: Params, stem: Branch | null, index: number): number {
  if (!stem || params.frondSpan <= 0 || params.frondCount < 2) return 0;
  return index / (params.frondCount - 1);
}

/**
 * Degrees above horizontal a frond leaves at.
 *
 * On one point the variance is random: which fronds stand and which hang is
 * not visible in where they attach. Down a span it is ordered by depth, with a
 * little left random, because on a deep crown the hanging fronds are visibly
 * the low ones and a random spread puts a young frond under an old one.
 */
function pitchOf(params: Params, rng: Rng, depth: number, spanned: boolean): number {
  const spread = spanned ? (1 - 2 * depth) * 0.75 + rng.range(-0.25, 0.25) : rng.range(-1, 1);
  return params.frondAngle + params.frondVariance * spread;
}

function buildFronds(params: Params, skeleton: Skeleton, rosette: Rosette, cells: number): MeshAttributes {
  const grid = Math.ceil(Math.sqrt(cells));
  const uvCells = leafCells(params.textureSize, grid).slice(0, cells);
  const rng = createRng(params.seed ^ 0x6c3f9a17);
  const out = createBuilder();
  const stem = skeleton.branches[0] ?? null;
  const spanned = !!stem && params.frondSpan > 0;

  // Every frond shares the stem's sway phase, or the rosette would drift off
  // the stem top it is pinned to. Its own motion is flutter, phased per frond.
  const phase = clusterPhase(params, 0);
  const rosettePhase = hash2(params.seed, 0x3d) * TWO_PI;

  for (let frond = 0; frond < params.frondCount; frond++) {
    // Down the span by index and round it by the golden angle, so height and
    // azimuth stay uncorrelated — the reason a tree's children are placed so.
    const depth = depthOf(params, stem, frond);
    const at: Rosette = spanned ? sampleBranch(stem!, 1 - params.frondSpan * depth) : rosette;

    // Spread by the golden angle and jittered, for the reason a tuft's cards
    // are: an even fraction of a turn reads as a machined rosette.
    const yaw = rosettePhase + GOLDEN_ANGLE * frond + rng.range(-0.3, 0.3);
    const outward = normalize(rotateAbout(perpendicular(at.dir), at.dir, yaw));
    const side = normalize(cross(at.dir, outward));

    const pitch = pitchOf(params, rng, depth, spanned);

    // Frond 0 is always full length, so frondLength means what it says. The
    // rest fall short, or the rosette comes to a machined rim.
    const frondLength = params.frondLength * (frond === 0 ? 1 : rng.range(0.75, 1));
    const halfWidth = (frondLength * params.cardAspect) / 2;

    // Off the stem's surface rather than its axis. A fern has no stem, and its
    // fronds still leave a crown a few centimetres across.
    const base = add(at.p, scale(outward, Math.max(at.radius, frondLength * 0.02)));

    const key = frond;
    const frondPhase = hash2(params.seed ^ 0x51ed270b, key);
    const cell = columnOf(uvCells[Math.floor(hash2(params.seed, key * 977) * cells) % cells], params.cardAspect);
    const normal = rosetteNormal(params, outward);

    // Walked rather than solved, so the frond's length is its arc length.
    let point = base;
    const rowStart: number[] = [];

    for (let k = 0; k <= params.cardSegments; k++) {
      const t = k / params.cardSegments;

      if (k > 0) {
        const direction = normalize(rotateAbout(at.dir, side, tiltAt(params, pitch, t)));
        point = add(point, scale(direction, frondLength / params.cardSegments));
      }

      const bend = bendWeight(params, skeleton, at.dist + t * frondLength);
      rowStart.push(out.positions.length / 3);

      for (const across of [-1, 1]) {
        pushVertex(
          out,
          add(point, scale(side, across * halfWidth)),
          normal,
          [cell.u0 + (across * 0.5 + 0.5) * (cell.u1 - cell.u0), cell.v1 - t * (cell.v1 - cell.v0)],
          [bend, phase, t, frondPhase]
        );
      }
    }

    // Wound the way a tuft's cards are, so the front face points outward.
    for (let k = 0; k < params.cardSegments; k++) {
      const a = rowStart[k];
      const b = rowStart[k + 1];
      out.indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  return finish(out);
}

/**
 * The stem as a skeleton, or the ground as one.
 *
 * Built even without a stem, because bend weight is measured against the
 * skeleton's path length and the fronds need one to bend against. Only the
 * stem branch is optional.
 */
function stemSkeleton(params: Params, rng: Rng): { skeleton: Skeleton; rosette: Rosette } {
  const stem = hasStem(params) ? growStem(params, rng) : null;
  const top = stem ? stem.points[stem.points.length - 1] : null;

  const rosette: Rosette = top
    ? { p: top.p, dir: top.dir, radius: top.radius, dist: top.dist }
    : { p: [0, 0, 0], dir: UP, radius: 0, dist: 0 };

  // The frond tip must not resolve to bend 1 before it has anywhere to go.
  const maxPathDist = params.stemHeight + params.frondLength;

  return {
    skeleton: {
      branches: stem ? [stem] : [],
      maxPathDist,
      canopy: { spread: params.frondLength, centre: rosette.p },
      trunk: { radius: params.trunkRadius, height: params.stemHeight, splitHeight: params.stemHeight },
    },
    rosette,
  };
}

/**
 * `cells` is how many of the frond atlas's cells were painted, from
 * `crownAtlas` or the set's manifest, so a card never addresses past it.
 */
export function buildCrown(params: Params, cells: number, bark: BarkTile | null = null): Crown {
  const rng = createRng(params.seed ^ 0x2d51f39b);
  const { skeleton, rosette } = stemSkeleton(params, rng);
  const fronds = buildFronds(params, skeleton, rosette, Math.max(1, cells));

  const pieces: ForgeMesh['pieces'] = [];
  if (skeleton.branches.length)
    pieces.push({ key: 'bark', attributes: buildBark(params, skeleton, bark), cutout: false });
  pieces.push({ key: 'frond', attributes: fronds, cutout: true });

  let height = 0;
  let spread = 0;
  for (const piece of pieces) {
    const positions = piece.attributes.positions;
    for (let i = 0; i < positions.length; i += 3) {
      height = Math.max(height, positions[i + 1]);
      spread = Math.max(spread, Math.hypot(positions[i], positions[i + 2]));
    }
  }

  // The measured spread, not the frond length: a drooping rosette is narrower
  // than its fronds are long, and that is what the placer should keep clear.
  skeleton.canopy.spread = spread;

  return {
    mesh: { pieces },
    skeleton: skeleton.branches.length ? skeleton : null,
    metrics: {
      height,
      spread,
      stemHeight: params.stemHeight,
      frondLength: params.frondLength,
      fronds: params.frondCount,
    },
  };
}
