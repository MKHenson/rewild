// The branch skeleton: positions, radii and the path distance from the root
// that COLOR_0's bend weight is derived from. Purely geometric, so it can be
// asserted against without building a mesh.

import { signedFbm, smoothstep } from './noise.ts';
import { trunkRingsOf, type Params } from './params.ts';
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
const TWO_PI = Math.PI * 2;
const UP: Vec3 = [0, 1, 0];

// Phyllotaxis. Spacing children by an even fraction of a turn ties azimuth to
// attach height, because both are indexed by the same child number — a ring
// spread along its parent then winds up one side as a helix. The golden angle
// spreads them evenly and leaves the two uncorrelated.
//
// A whorl wants the opposite and takes the even fraction instead: its children
// share one height, so there is no attach height for the azimuth to correlate
// with, and a ring of limbs at even angles is what a conifer has.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function ringsFor(params: Params, level: number): number {
  return level === 0 ? trunkRingsOf(params) : Math.max(2, params.segments - level + 1);
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

/**
 * Where one child attaches to its parent and how it leaves it. The two branch
 * models differ in this and in nothing else: both hand the same four numbers
 * to the same `growBranch`.
 */
interface Placement {
  /** Fraction along the parent the child attaches at. */
  attach: number;
  /** Turn about the parent's own axis, in radians. */
  azimuth: number;
  /** Degrees the child turns away from the parent's heading. */
  angle: number;
  /** Multiplies the child's length. What makes a whorled trunk a cone. */
  lengthScale: number;
}

/**
 * The dividing model: children spread back from the parent's tip along
 * `splitSpread` and turned by the golden angle.
 */
function forkPlacement(params: Params, rng: Rng, index: number, ringPhase: number, onTrunk: boolean): Placement {
  const spread = params.splits > 1 ? index / (params.splits - 1) : 0;

  // Child 0 off the trunk is the leader: a real trunk carries on past its
  // first fork rather than ending in a symmetric fan.
  const leader = onTrunk && index === 0;
  const angle = (leader ? params.splitAngle * 0.25 : params.splitAngle) + (rng() - 0.5) * 2 * params.splitVariance;

  return {
    attach: 1 - params.splitSpread * spread,
    azimuth: ringPhase + index * GOLDEN_ANGLE + (rng() - 0.5) * 0.6,
    angle,
    lengthScale: leader ? 1.15 : 1,
  };
}

/**
 * The conifer model: rings of limbs up an undivided trunk.
 *
 * The whorls climb the top `splitSpread` of the trunk at one fixed interval,
 * which leaves a bare foot below the lowest and a bare leader of one interval
 * above the top: the leading shoot a conifer carries above its last whorl.
 * Length falls from the lowest ring to `whorlTaper` at the top, and that fall
 * is the cone.
 */
function whorlPlacement(params: Params, rng: Rng, index: number): Placement {
  const ring = Math.floor(index / params.splits);
  const step = params.splitSpread / params.whorls;
  // 0 at the lowest ring, 1 at the top. A single whorl is the lowest one.
  const rise = params.whorls > 1 ? ring / (params.whorls - 1) : 0;

  const angle = params.splitAngle + (rng() - 0.5) * 2 * params.splitVariance;

  // Each ring is turned by a phase of its own, or every whorl stacks its limbs
  // into the same vertical planes and the tree reads as a mast with battens.
  const azimuth =
    hash2(params.seed ^ 0x27d4eb2f, ring) * TWO_PI +
    ((index % params.splits) / params.splits) * TWO_PI +
    (rng() - 0.5) * 0.35;

  return {
    attach: 1 - params.splitSpread + ring * step,
    azimuth,
    angle,
    lengthScale: 1 + (params.whorlTaper - 1) * rise,
  };
}

/**
 * Strays a trunk's or a stem's centre line off a straight climb.
 *
 * `curve` turns a branch about one fixed axis, which reads as a clean arc. A
 * real trunk leans one way and then back, so this is a smooth two-axis field
 * rather than more curve. It is held at zero at the foot, so the tree still
 * stands where it was planted, and the headings are rebuilt from the moved
 * points afterwards: the limbs sample the trunk, and the bark rings take their
 * frame from it, so both follow the stray for free.
 *
 * The field is hashed from the seed rather than drawn from the rng. A key that
 * is off by default must not shift the sequence every other branch reads from.
 */
export function wanderCentreLine(params: Params, trunk: Branch): void {
  const points = trunk.points;
  const last = points.length - 1;

  for (let i = 1; i <= last; i++) {
    const t = i / last;

    // Read up the y axis over two cells of three: one lean and a partial
    // second, which is what a trunk does. More cells read as a snake.
    //
    // Both periods are 2 or more and the x coordinate sits mid-cell on purpose.
    // A period of 1 makes the lattice's two rows the same row, so that axis
    // cancels and the field returns its mean everywhere; the first cut of this
    // read a 1-period axis and `trunkWander` moved nothing at all.
    const x = signedFbm(0.5, t * 2, 2, 3, 2, params.seed ^ 0x6d2b79f5);
    const z = signedFbm(1.5, t * 2, 2, 3, 2, params.seed ^ 0x1b56c4e9);
    // Eased in, and eased in with a flat start rather than a linear one. A ramp
    // that opens at full slope tilts the first ring by that slope, and a ring
    // tilted at the foot puts the low side of the trunk under the ground.
    const ramp = smoothstep(0, 0.3, t);
    const stray = params.trunkWander * ramp;

    points[i].p = [points[i].p[0] + x * stray, points[i].p[1], points[i].p[2] + z * stray];
  }

  for (let i = 0; i <= last; i++) {
    const before = points[Math.max(0, i - 1)].p;
    const after = points[Math.min(last, i + 1)].p;
    if (before !== after) points[i].dir = normalize(sub(after, before));
  }
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
  if (params.trunkWander > 0) wanderCentreLine(params, trunk);
  branches.push(trunk);

  const queue = [trunk];

  // Walked by index rather than shifted, because the loop pushes onto the same
  // queue it is reading.
  for (let head = 0; head < queue.length; head++) {
    const parent = queue[head];
    if (parent.level >= params.branchLevels) continue;

    // Each ring starts at its own angle, so successive levels do not stack
    // their branches into the same vertical planes.
    const ringPhase = hash2(params.seed, parent.id) * TWO_PI;

    // The whorl model governs the trunk alone. A conifer's limbs divide the
    // ordinary way once they have left it, so everything below level 0 forks
    // whatever the model says.
    const whorled = params.branchModel === 'whorl' && parent.level === 0;
    const children = whorled ? params.whorls * params.splits : params.splits;

    for (let i = 0; i < children; i++) {
      const placement = whorled
        ? whorlPlacement(params, rng, i)
        : forkPlacement(params, rng, i, ringPhase, parent.level === 0);

      const at = sampleBranch(parent, placement.attach);

      const axis = rotateAbout(perpendicular(at.dir), at.dir, placement.azimuth);
      const direction = normalize(rotateAbout(at.dir, normalize(axis), placement.angle * DEG));

      const child = growBranch(params, rng, {
        id: nextId++,
        level: parent.level + 1,
        clusterId: parent.level === 0 ? nextId : parent.clusterId,
        origin: at.p,
        direction,
        branchLength: parent.length * params.lengthRatio * placement.lengthScale * rng.range(0.85, 1.15),
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
  //
  // A whorled trunk never forks. It runs unbroken to the tip, so there is a
  // solid column the whole way up and the proxy follows it there. Stopping at
  // the lowest whorl would leave a spruce with a stub of a collider and a
  // player walking through its trunk.
  const trunkChildren = params.branchModel === 'whorl' ? [] : branches.filter((branch) => branch.level === 1);

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
