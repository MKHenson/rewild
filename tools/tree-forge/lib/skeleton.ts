// The branch skeleton: positions, radii and the path distance from the root
// that COLOR_0's bend weight is derived from. Purely geometric, so it can be
// asserted against without building a mesh.

import type { Params } from './params.ts';
import { createRng, hash2, type Rng } from './rng.ts';
import { cross, length, normalize, perpendicular, rotateAbout, scale, sub, type Vec3 } from './vec.ts';

/** One ring of a branch's centre line. */
export interface BranchPoint {
  p: Vec3;
  radius: number;
  /** Path distance from the tree's root, which is what bend weight is derived from. */
  dist: number;
  dir: Vec3;
}

export interface Branch {
  id: number;
  level: number;
  /** The limb this branch belongs to. One wind phase per limb. */
  clusterId: number;
  points: BranchPoint[];
  length: number;
  baseRadius: number;
  tipRadius: number;
  children: number[];
  bearsLeaves?: boolean;
}

export interface Skeleton {
  branches: Branch[];
  maxPathDist: number;
  canopy: { spread: number; centre: Vec3 };
  trunk: { radius: number; height: number; splitHeight: number };
}

interface GrowSpec {
  id: number;
  level: number;
  clusterId: number;
  origin: Vec3;
  direction: Vec3;
  branchLength: number;
  baseRadius: number;
  baseDist: number;
}

const DEG = Math.PI / 180;
const UP: Vec3 = [0, 1, 0];

// Phyllotaxis. Spacing children by an even fraction of a turn ties azimuth to
// attach height, because both are indexed by the same child number — a whorl
// spread along its parent then winds up one side as a helix. The golden angle
// spreads them evenly and leaves the two uncorrelated.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function ringsFor(params: Params, level: number): number {
  return level === 0 ? params.segments + 2 : Math.max(2, params.segments - level + 1);
}

function radiusAt(base: number, tip: number, t: number): number {
  return tip + (base - tip) * (1 - t) ** 1.3;
}

/** Walks a branch's centre line, integrating curve and droop as it climbs. */
function growBranch(
  params: Params,
  rng: Rng,
  { id, level, clusterId, origin, direction, branchLength, baseRadius, baseDist }: GrowSpec
): Branch {
  const rings = ringsFor(params, level);
  const tipRadius = baseRadius * (level === 0 ? params.trunkTaper : 0.28);
  const step = branchLength / (rings - 1);

  // One fixed axis per branch rather than a fresh one per step: a random walk
  // averages back to straight, which reads as a wobble instead of a bend.
  const bendAxis = rotateAbout(perpendicular(direction), direction, rng() * Math.PI * 2);
  const curveStep = (params.curve * DEG) / (rings - 1);
  // Split angles compound with depth, so a deep tree fans out until the crown
  // is a disc. A negative droop is the counter: it bends a branch back toward
  // vertical over its own length, which is what keeps a crown compact.
  const droopStep = level === 0 ? 0 : (params.droop * DEG * level) / Math.max(1, params.branchLevels) / (rings - 1);
  const droopTarget: Vec3 = droopStep < 0 ? [0, 1, 0] : [0, -1, 0];

  const points: BranchPoint[] = [];
  let position = origin;
  let heading = direction;
  let distance = baseDist;

  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    points.push({ p: position, radius: radiusAt(baseRadius, tipRadius, t), dist: distance, dir: heading });
    if (i === rings - 1) break;

    heading = rotateAbout(heading, bendAxis, curveStep);

    if (droopStep !== 0) {
      const axis = cross(heading, droopTarget);
      if (length(axis) > 1e-4) heading = rotateAbout(heading, normalize(axis), Math.abs(droopStep));
    }

    heading = normalize(heading);
    position = [position[0] + heading[0] * step, position[1] + heading[1] * step, position[2] + heading[2] * step];
    distance += step;
  }

  return { id, level, clusterId, points, length: branchLength, baseRadius, tipRadius, children: [] };
}

/** Position, radius, distance and heading at a fraction along a branch. */
export function sampleBranch(branch: Branch, t: number): BranchPoint {
  const points = branch.points;
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const frac = scaled - index;
  const a = points[index];
  const b = points[index + 1];

  return {
    p: [a.p[0] + (b.p[0] - a.p[0]) * frac, a.p[1] + (b.p[1] - a.p[1]) * frac, a.p[2] + (b.p[2] - a.p[2]) * frac],
    radius: a.radius + (b.radius - a.radius) * frac,
    dist: a.dist + (b.dist - a.dist) * frac,
    dir: normalize(b.p[0] === a.p[0] && b.p[1] === a.p[1] && b.p[2] === a.p[2] ? a.dir : sub(b.p, a.p)),
  };
}

export function buildSkeleton(params: Params): Skeleton {
  const rng = createRng(params.seed);
  const branches: Branch[] = [];
  let nextId = 0;

  const trunk = growBranch(params, rng, {
    id: nextId++,
    level: 0,
    clusterId: 0,
    origin: [0, 0, 0],
    direction: UP,
    branchLength: params.height,
    baseRadius: params.trunkRadius,
    baseDist: 0,
  });
  branches.push(trunk);

  const queue = [trunk];

  // Walked by index rather than shifted, because the loop pushes onto the same
  // queue it is reading.
  for (let head = 0; head < queue.length; head++) {
    const parent = queue[head];
    if (parent.level >= params.branchLevels) continue;

    // Each whorl starts at its own angle, so successive levels do not stack
    // their branches into the same vertical planes.
    const whorlPhase = hash2(params.seed, parent.id) * Math.PI * 2;

    for (let i = 0; i < params.splits; i++) {
      const spread = params.splits > 1 ? i / (params.splits - 1) : 0;
      const attach = 1 - params.splitSpread * spread;
      const at = sampleBranch(parent, attach);

      // Child 0 off the trunk is the leader: a real trunk carries on past its
      // first fork rather than ending in a symmetric fan.
      const leader = parent.level === 0 && i === 0;
      const angle = (leader ? params.splitAngle * 0.25 : params.splitAngle) + (rng() - 0.5) * 2 * params.splitVariance;

      const azimuth = whorlPhase + i * GOLDEN_ANGLE + (rng() - 0.5) * 0.6;
      const axis = rotateAbout(perpendicular(at.dir), at.dir, azimuth);
      const direction = normalize(rotateAbout(at.dir, normalize(axis), angle * DEG));

      const child = growBranch(params, rng, {
        id: nextId++,
        level: parent.level + 1,
        clusterId: parent.level === 0 ? nextId : parent.clusterId,
        origin: at.p,
        direction,
        branchLength: parent.length * params.lengthRatio * (leader ? 1.15 : 1) * rng.range(0.85, 1.15),
        baseRadius: at.radius * params.radiusRatio,
        baseDist: at.dist,
      });

      parent.children.push(child.id);
      branches.push(child);
      queue.push(child);
    }
  }

  return finalise(params, branches);
}

function finalise(params: Params, branches: Branch[]): Skeleton {
  // Leaves grow on the deepest generations, not only on childless tips. Tip
  // count is splits^levels, so a two-way split or a shallow tree has too few
  // tips to hang a canopy from and comes out bare.
  const foliage = branches.filter((branch) => branch.level > params.branchLevels - params.leafLevels);
  for (const branch of foliage) branch.bearsLeaves = true;

  let grownHeight = 0;
  for (const branch of branches)
    for (const point of branch.points) grownHeight = Math.max(grownHeight, point.p[1]);

  // The trunk carries on past its first fork, so the grown height is not the
  // trunk length. Normalising here is what makes height mean the height of
  // the tree rather than of one branch, and it leaves the radii alone so
  // trunkRadius keeps meaning what it says.
  const factor = grownHeight > 1e-6 ? params.height / grownHeight : 1;

  let maxPathDist = 0;
  let canopySpread = 0;
  const canopyCentre: Vec3 = [0, 0, 0];

  // Where the trunk first forks. The collider proxy stops here: a straight
  // capsule cannot follow a curving trunk, and above the fork there is nothing
  // solid enough to be worth the mismatch.
  const trunkChildren = branches.filter((branch) => branch.level === 1);

  for (const branch of branches) {
    branch.length *= factor;
    for (const point of branch.points) {
      point.p = scale(point.p, factor);
      point.dist *= factor;
      maxPathDist = Math.max(maxPathDist, point.dist);
    }
  }

  for (const branch of foliage) {
    for (const point of branch.points)
      canopySpread = Math.max(canopySpread, Math.hypot(point.p[0], point.p[2]));

    const tip = branch.points[branch.points.length - 1];
    for (let axis = 0; axis < 3; axis++) canopyCentre[axis] += tip.p[axis] / Math.max(1, foliage.length);
  }

  // Leaves sit beyond the last ring, so the tip must not resolve to bend 1
  // before a leaf has anywhere left to go.
  maxPathDist += params.leafSize;
  canopySpread += params.leafSize;

  return {
    branches,
    maxPathDist,
    // `spread` is measured about the trunk axis because that is what decides
    // how far apart the placer must keep two trees. `centre` is the crown's
    // actual middle, which is what a canopy normal points away from.
    canopy: { spread: canopySpread, centre: foliage.length ? canopyCentre : [0, params.height, 0] },
    trunk: {
      radius: params.trunkRadius,
      height: params.height,
      splitHeight: trunkChildren.length
        ? Math.min(...trunkChildren.map((branch) => branch.points[0].p[1]))
        : params.height,
    },
  };
}

/** COLOR_0.r: 0 at the rigid base, 1 at a free tip, shaped by bendCurve. */
export function bendWeight(params: Params, skeleton: Skeleton, distance: number): number {
  const t = Math.min(1, distance / skeleton.maxPathDist);
  return t ** params.bendCurve;
}

/** COLOR_0.g: one phase per limb, so a whole branch sways together. */
export function clusterPhase(params: Params, clusterId: number): number {
  return hash2(params.seed ^ 0x51ed270b, clusterId);
}
