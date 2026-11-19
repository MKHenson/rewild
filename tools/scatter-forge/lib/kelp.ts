// Kelp: stalks rising from a holdfast on the bed, carrying ribbon blades and
// the gas floats that hold them up. Giant kelp, bull kelp and sugar kelp are
// one structure that differs in where the blades leave the stalk, so they are
// a `bladeLayout`, not three types.
//
// Two pieces. The stalks, the holdfast and the floats are solid tubes and balls
// on one opaque material. The blades are cutout cards on the frond strips a
// crown cuts, so authored frond art and accents work the same way. A blade is
// three columns wide, so its edges can ruffle out of the plane while its
// midrib stays flat.

import { accentRng, buildAccent, cardsAt, type AccentSite } from './accents.ts';
import { accentCells, cellUvs, columnOf, type AtlasLayout, type UvRect } from './atlas.ts';
import { createBuilder, finish, pushVertex, type BarkTile, type Builder, type ForgeMesh } from './mesh.ts';
import type { AccentSpec, Params } from './params.ts';
import { createRng, hash2, type Rng } from './rng.ts';
import { add, cross, length, normalize, perpendicular, rotateAbout, scale, sub, transport, type Vec3 } from './vec.ts';

const DEG = Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TWO_PI = Math.PI * 2;
const UP: Vec3 = [0, 1, 0];

/** Columns across a blade: two edges and the midrib. */
const BLADE_COLUMNS = 3;
/** Sides and rings of a float. */
const BLADDER_SIDES = 6;
const BLADDER_RINGS = 4;
/** Rings and sides of a holdfast finger. */
const FINGER_RINGS = 4;
const FINGER_SIDES = 5;

export interface KelpMetrics {
  /** Metres to the topmost vertex. */
  height: number;
  /** Radius about the vertical axis, which is what the placer keeps clear. */
  spread: number;
  /** Length of the longest stalk. */
  stalk: number;
  stipes: number;
  blades: number;
  bladders: number;
}

export interface Kelp {
  mesh: ForgeMesh;
  metrics: KelpMetrics;
}

/** One ring of a stalk's centre line. */
interface StalkPoint {
  p: Vec3;
  dir: Vec3;
  radius: number;
  dist: number;
}

interface Stalk {
  points: StalkPoint[];
  length: number;
  /** COLOR_0.g: one sway phase per stalk, so its blades ride it. */
  phase: number;
  /** Horizontal direction the stalk leans out toward. */
  outward: Vec3;
}

/** Length of every stalk before its own shortening: the blades reach on past it. */
export function stalkLength(params: Params): number {
  if (params.bladeLayout === 'tip') return Math.max(params.height * 0.2, params.height - params.bladeLength * 0.7);
  if (params.bladeLayout === 'single') return Math.max(params.height * 0.1, params.height - params.bladeLength);
  return params.height;
}

/** Path distance the bend weight is measured against: the tallest stalk plus a blade. */
function maxPathOf(params: Params): number {
  return stalkLength(params) + params.bladeLength;
}

function bendAt(params: Params, distance: number): number {
  return Math.min(1, distance / maxPathOf(params)) ** params.bendCurve;
}

function radiusAt(params: Params, t: number): number {
  return params.stipeRadius * (params.stipeTaper + (1 - params.stipeTaper) * (1 - t));
}

/** A point `t` of the way up a stalk, interpolated between its rings. */
function sampleStalk(stalk: Stalk, t: number): StalkPoint {
  const points = stalk.points;
  const scaled = Math.min(1, Math.max(0, t)) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = points[i];
  const b = points[i + 1];
  return {
    p: add(a.p, scale(sub(b.p, a.p), f)),
    dir: normalize(add(scale(a.dir, 1 - f), scale(b.dir, f))),
    radius: a.radius + (b.radius - a.radius) * f,
    dist: a.dist + (b.dist - a.dist) * f,
  };
}

/**
 * One stalk: a lean that grows with height, outward from the holdfast, and a
 * slow wander of two sine pairs either side of it. The wander is held at zero
 * at the base, so every stalk leaves the holdfast where it was rooted.
 */
function growStalk(params: Params, rng: Rng, index: number): Stalk {
  const full = stalkLength(params);
  const reach = full * (index === 0 ? 1 : rng.range(1 - params.stipeHeights, 1));
  const azimuth = index * GOLDEN_ANGLE + rng.range(-0.4, 0.4);
  const outward: Vec3 = [Math.cos(azimuth), 0, Math.sin(azimuth)];
  const side = normalize(cross(UP, outward));
  const spread = params.stipeSpread * params.height * Math.sqrt(rng());
  const base: Vec3 = index === 0 && params.stipes > 1 ? [0, 0, 0] : scale(outward, spread);
  const lean = params.stipeLean * DEG * rng.range(0.5, 1);
  const phases = [rng() * TWO_PI, rng() * TWO_PI, rng() * TWO_PI, rng() * TWO_PI];

  const rings = params.stipeSegments + 1;
  const step = reach / params.stipeSegments;
  const headingAt = (t: number): Vec3 => normalize(rotateAbout(UP, side, lean * t));
  const wanderAt = (t: number): Vec3 => {
    const a = Math.sin(t * Math.PI * 1.3 + phases[0]) * 0.6 + Math.sin(t * Math.PI * 2.9 + phases[1]) * 0.4;
    const b = Math.sin(t * Math.PI * 1.7 + phases[2]) * 0.6 + Math.sin(t * Math.PI * 3.3 + phases[3]) * 0.4;
    const sway = params.stipeWander * t;
    return add(scale(side, a * sway), scale(outward, b * sway * 0.5));
  };

  const spine: Vec3[] = [];
  let walked = base;
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    if (i > 0) walked = add(walked, scale(headingAt(t), step));
    spine.push(add(walked, wanderAt(t)));
  }

  const points: StalkPoint[] = [];
  let dist = 0;
  for (let i = 0; i < rings; i++) {
    if (i > 0) dist += length(sub(spine[i], spine[i - 1]));
    const ahead = spine[Math.min(rings - 1, i + 1)];
    const behind = spine[Math.max(0, i - 1)];
    points.push({ p: spine[i], dir: normalize(sub(ahead, behind)), radius: radiusAt(params, i / (rings - 1)), dist });
  }

  return { points, length: dist, phase: hash2(params.seed ^ 0x51ed270b, index), outward };
}

/** Texture repeats about one ring and along a metre, authored tile or generated. */
function tileOf(params: Params, bark: BarkTile | null, radius: number): { turns: number; along: number } {
  const circumference = TWO_PI * radius;
  const turns = bark ? Math.max(1, Math.round(circumference / bark.metresAround)) : 1;
  const aspect = bark ? bark.aspect : params.barkAspect;
  return { turns, along: (circumference / turns) * aspect };
}

/**
 * A closed tube along `points`, capped at the tip by a degenerate ring. The
 * frame is carried by parallel transport so the tube never twists.
 */
function pushTube(
  out: Builder,
  points: StalkPoint[],
  sides: number,
  tile: { turns: number; along: number },
  colour: (point: StalkPoint) => [number, number, number, number]
): void {
  const tip = points[points.length - 1];
  const rings = [...points, { p: add(tip.p, scale(tip.dir, tip.radius)), dir: tip.dir, radius: tip.radius * 0.02, dist: tip.dist + tip.radius }];

  let normal = perpendicular(rings[0].dir);
  let heading = rings[0].dir;
  const starts: number[] = [];

  for (const ring of rings) {
    normal = normalize(transport(normal, heading, ring.dir));
    heading = ring.dir;
    const binormal = cross(ring.dir, normal);
    const v = ring.dist / tile.along;
    starts.push(out.positions.length / 3);

    for (let j = 0; j <= sides; j++) {
      const angle = (j / sides) * TWO_PI;
      const offset = add(scale(normal, Math.cos(angle)), scale(binormal, Math.sin(angle)));
      pushVertex(out, add(ring.p, scale(offset, ring.radius)), offset, [(j / sides) * tile.turns, v], colour(ring));
    }
  }

  for (let i = 0; i < rings.length - 1; i++) {
    const a = starts[i];
    const b = starts[i + 1];
    for (let j = 0; j < sides; j++) out.indices.push(a + j, a + j + 1, b + j, a + j + 1, b + j + 1, b + j);
  }
}

/**
 * A float: a ball stretched along `axis` by `stretch`. Pear-shaped where
 * `stretch` is above 1, the way a giant kelp's float swells under its blade.
 */
function pushBladder(
  out: Builder,
  centre: Vec3,
  axis: Vec3,
  radius: number,
  stretch: number,
  colour: [number, number, number, number]
): void {
  const side = perpendicular(axis);
  const other = cross(axis, side);
  const start = out.positions.length / 3;

  for (let r = 0; r <= BLADDER_RINGS; r++) {
    const polar = (r / BLADDER_RINGS) * Math.PI;
    const along = -Math.cos(polar);
    // Narrower toward the stalk end, so the float tapers into it.
    const ring = Math.sin(polar) * (1 - 0.25 * Math.max(0, -along));
    for (let j = 0; j <= BLADDER_SIDES; j++) {
      const angle = (j / BLADDER_SIDES) * TWO_PI;
      const around = add(scale(side, Math.cos(angle)), scale(other, Math.sin(angle)));
      const offset = add(scale(around, ring * radius), scale(axis, along * radius * stretch));
      const normal = normalize(add(scale(around, ring), scale(axis, along / stretch)));
      pushVertex(out, add(centre, offset), normal, [j / BLADDER_SIDES, r / BLADDER_RINGS], colour);
    }
  }

  const row = BLADDER_SIDES + 1;
  for (let r = 0; r < BLADDER_RINGS; r++)
    for (let j = 0; j < BLADDER_SIDES; j++) {
      const a = start + r * row + j;
      const b = a + row;
      out.indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
}

/**
 * The holdfast: fingers that leave a low mound and arch out over the bed,
 * dipping just under it at their tips so they read as gripping the rock.
 */
function pushHoldfast(params: Params, out: Builder, bark: BarkTile | null): void {
  if (params.holdfastRadius <= 0 || params.holdfastFingers < 1) return;
  const rng = createRng(params.seed ^ 0x7f4a7c15);
  const thickness = Math.max(params.stipeRadius * 1.1, params.holdfastRadius * 0.12);
  const tile = tileOf(params, bark, thickness);

  for (let f = 0; f < params.holdfastFingers; f++) {
    const azimuth = f * GOLDEN_ANGLE + rng.range(-0.3, 0.3);
    const outward: Vec3 = [Math.cos(azimuth), 0, Math.sin(azimuth)];
    const reach = params.holdfastRadius * rng.range(0.55, 1);
    const rise = params.holdfastHeight * rng.range(0.6, 1);
    const points: StalkPoint[] = [];
    let dist = 0;
    let previous: Vec3 | null = null;

    for (let k = 0; k <= FINGER_RINGS; k++) {
      const t = k / FINGER_RINGS;
      const p: Vec3 = add(scale(outward, reach * t), [0, rise * Math.sin(Math.PI * (0.5 + 0.6 * t)) - thickness * 0.5 * t, 0]);
      if (previous) dist += length(sub(p, previous));
      previous = p;
      points.push({ p, dir: UP, radius: thickness * (1 - 0.6 * t), dist });
    }
    for (let k = 0; k < points.length; k++) {
      const ahead = points[Math.min(points.length - 1, k + 1)].p;
      const behind = points[Math.max(0, k - 1)].p;
      points[k].dir = normalize(sub(ahead, behind));
    }

    pushTube(out, points, FINGER_SIDES, tile, () => [0, 0, 0, 1]);
  }
}

/** A blade's shading normal, in the modes a crown's frond takes. */
function bladeNormal(params: Params, outward: Vec3, face: Vec3): Vec3 {
  if (params.leafNormalMode === 'card') return face;
  if (params.leafNormalMode === 'up') return UP;
  return normalize(add(scale(outward, params.normalLean), UP));
}

/** Where one blade leaves its stalk, and which way it heads first. */
interface BladeSite {
  base: Vec3;
  /** Direction the blade starts along. */
  dir: Vec3;
  /** Horizontal-ish direction it faces out toward, for its normal and its twist. */
  outward: Vec3;
  dist: number;
  phase: number;
  key: number;
}

/**
 * One blade: a card three columns wide walked along `cardSegments`, bowed by
 * `cardCurve`, twisted by `bladeTwist` and with its two edges ruffled out of
 * the plane in opposite phase. Normals come from the finished surface, so the
 * ruffles shade.
 */
function pushBlade(params: Params, out: Builder, site: BladeSite, bladeLength: number, cell: UvRect, flutterPhase: number): void {
  const segments = params.cardSegments;
  const halfWidth = (bladeLength * params.cardAspect * params.bladeWidth) / 2;
  const side0 = normalize(cross(site.dir, site.outward));
  const side = length(side0) > 1e-6 ? side0 : perpendicular(site.dir);
  const bowAxis = normalize(cross(site.dir, side));
  const ruffle = params.bladeRuffle;
  const waves = params.bladeRuffleWaves;
  const wavePhase = hash2(params.seed ^ 0x1b873593, site.key) * TWO_PI;

  const grid: Vec3[][] = [];
  let point = site.base;
  for (let k = 0; k <= segments; k++) {
    const t = k / segments;
    const direction = normalize(rotateAbout(site.dir, bowAxis, params.cardCurve * DEG * t * t));
    if (k > 0) point = add(point, scale(direction, bladeLength / segments));
    const across = normalize(rotateAbout(side, direction, params.bladeTwist * DEG * t));
    const face = normalize(cross(across, direction));
    // The edges ruffle, the midrib does not, and neither does the stalk end.
    const swell = Math.sin(Math.PI * Math.min(1, t * 1.15));
    const row: Vec3[] = [];
    for (let c = 0; c < BLADE_COLUMNS; c++) {
      const s = (c / (BLADE_COLUMNS - 1)) * 2 - 1;
      const wave = Math.sin(t * waves * TWO_PI + wavePhase + (s > 0 ? Math.PI * 0.5 : 0));
      const lift = Math.abs(s) * ruffle * swell * wave;
      row.push(add(add(point, scale(across, s * halfWidth)), scale(face, lift)));
    }
    grid.push(row);
  }

  const starts: number[] = [];
  for (let k = 0; k <= segments; k++) {
    const t = k / segments;
    const bend = bendAt(params, site.dist + t * bladeLength);
    starts.push(out.positions.length / 3);
    for (let c = 0; c < BLADE_COLUMNS; c++) {
      const along = sub(grid[Math.min(segments, k + 1)][c], grid[Math.max(0, k - 1)][c]);
      const across = sub(grid[k][Math.min(BLADE_COLUMNS - 1, c + 1)], grid[k][Math.max(0, c - 1)]);
      const face = normalize(cross(across, along));
      const u = c / (BLADE_COLUMNS - 1);
      pushVertex(
        out,
        grid[k][c],
        bladeNormal(params, site.outward, face),
        [cell.u0 + u * (cell.u1 - cell.u0), cell.v1 - t * (cell.v1 - cell.v0)],
        [bend, site.phase, t, flutterPhase]
      );
    }
  }

  for (let k = 0; k < segments; k++)
    for (let c = 0; c < BLADE_COLUMNS - 1; c++) {
      const a = starts[k] + c;
      const b = starts[k + 1] + c;
      out.indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
}

/** Every place a blade leaves a stalk, by layout. */
function bladeSites(params: Params, stalk: Stalk, index: number, rng: Rng): BladeSite[] {
  const sites: BladeSite[] = [];
  const top = stalk.points[stalk.points.length - 1];
  const azimuth = rng() * TWO_PI;

  const outwardAt = (yaw: number, dir: Vec3): Vec3 => {
    const flat = normalize(perpendicular(dir));
    return normalize(rotateAbout(flat, dir, yaw));
  };
  const leaving = (dir: Vec3, outward: Vec3, angle: number): Vec3 => {
    const axis = normalize(cross(dir, outward));
    return normalize(rotateAbout(dir, axis, -angle * DEG));
  };

  if (params.bladeLayout === 'along') {
    const count = params.bladesPerStipe;
    for (let i = 0; i < count; i++) {
      const t = 1 - params.bladeSpan + (params.bladeSpan * (i + rng.range(0.2, 0.8))) / count;
      const at = sampleStalk(stalk, t);
      const yaw = params.bladeAlternate ? azimuth + (i % 2) * Math.PI + rng.range(-0.3, 0.3) : azimuth + i * GOLDEN_ANGLE;
      const outward = outwardAt(yaw, at.dir);
      // Blades high on the stalk stand closer to it.
      const angle = params.bladeAngle * (1 - 0.4 * t) * rng.range(0.8, 1.15);
      sites.push({
        base: add(at.p, scale(outward, at.radius)),
        dir: leaving(at.dir, outward, angle),
        outward,
        dist: at.dist,
        phase: stalk.phase,
        key: index * 256 + i,
      });
    }
    return sites;
  }

  const count = params.bladeLayout === 'single' ? 1 : params.bladesPerStipe;
  for (let i = 0; i < count; i++) {
    const yaw = azimuth + i * GOLDEN_ANGLE + rng.range(-0.3, 0.3);
    const outward = outwardAt(yaw, top.dir);
    const angle = params.bladeLayout === 'single' ? params.bladeAngle * 0.25 : params.bladeAngle * rng.range(0.4, 1);
    sites.push({
      base: add(top.p, scale(outward, top.radius)),
      dir: leaving(top.dir, outward, angle),
      outward,
      dist: top.dist,
      phase: stalk.phase,
      key: index * 256 + i,
    });
  }
  return sites;
}

/**
 * Where an accent leaves a stalk: dealt down `depth` of each stalk from its top,
 * `count` per stalk. Left out, the band follows the blades.
 */
function kelpSites(params: Params, stalks: Stalk[], spec: AccentSpec, rng: Rng): AccentSite[] {
  const [from, to] = spec.depth ?? [0, params.bladeLayout === 'along' ? params.bladeSpan : 0];
  const sites: AccentSite[] = [];
  stalks.forEach((stalk, s) => {
    const cards = cardsAt(spec.count, rng);
    for (let i = 0; i < cards; i++) {
      const depth = cards > 1 ? from + ((to - from) * i) / (cards - 1) : from;
      const at = sampleStalk(stalk, 1 - depth);
      sites.push({ p: at.p, radius: Math.max(at.radius, spec.length * 0.02), dist: at.dist, phase: stalk.phase, key: s * 64 + i });
    }
  });
  return sites;
}

/**
 * `atlas` is how the blade image was cut, from `atlasLayoutFor` or the set's
 * manifest, so a blade never addresses past what was painted.
 */
export function buildKelp(params: Params, atlas: AtlasLayout, bark: BarkTile | null = null): Kelp {
  const rng = createRng(params.seed ^ 0x4b1d3a5f);
  const stalks: Stalk[] = [];
  for (let s = 0; s < params.stipes; s++) stalks.push(growStalk(params, rng, s));

  const solid = createBuilder();
  const blades = createBuilder();
  const cells = Math.max(1, atlas.cells);
  const uvCells = cellUvs(params.textureSize, { ...atlas, cells }).slice(0, cells);
  const bladeRng = createRng(params.seed ^ 0x6c3f9a17);
  let bladeCount = 0;
  let bladderCount = 0;

  pushHoldfast(params, solid, bark);

  stalks.forEach((stalk, s) => {
    const tile = tileOf(params, bark, params.stipeRadius);
    pushTube(solid, stalk.points, params.stipeSides, tile, (point) => [bendAt(params, point.dist), stalk.phase, 0, 1]);

    const top = stalk.points[stalk.points.length - 1];
    const sites = bladeSites(params, stalk, s, bladeRng);

    if (params.bladders === 'tip') {
      const radius = params.bladderRadius;
      const centre = add(top.p, scale(top.dir, radius * 0.8));
      pushBladder(solid, centre, top.dir, radius, 1.15, [bendAt(params, top.dist), stalk.phase, 0, 1]);
      bladderCount++;
      // Blades that leave the top leave the bulb instead; blades up the stalk stay.
      if (params.bladeLayout !== 'along')
        for (const site of sites) {
          site.base = add(centre, scale(site.dir, radius * 0.9));
          site.dist += radius;
        }
    }

    for (const site of sites) {
      if (params.bladders === 'blade') {
        const radius = params.bladderRadius * bladeRng.range(0.8, 1.1);
        const centre = add(site.base, scale(site.dir, radius * 1.3));
        pushBladder(solid, centre, site.dir, radius, 1.4, [bendAt(params, site.dist + radius), stalk.phase, 0, 1]);
        bladderCount++;
        site.base = add(centre, scale(site.dir, radius * 1.3));
        site.dist += radius * 2.6;
      }

      const bladeLength = params.bladeLength * (site.key % 256 === 0 ? 1 : bladeRng.range(0.7, 1));
      const cell = columnOf(uvCells[Math.floor(hash2(params.seed, site.key * 977) * cells) % cells], params.cardAspect);
      pushBlade(params, blades, site, bladeLength, cell, hash2(params.seed ^ 0x2545f491, site.key));
      bladeCount++;
    }
  });

  params.accents.forEach((spec, index) =>
    buildAccent(blades, params, index, spec, kelpSites(params, stalks, spec, accentRng(params, index)), accentCells(params.textureSize, atlas, index), {
      bend: (site, along) => bendAt(params, site.dist + along),
      normal: (_site, outward, face) => bladeNormal(params, outward, face),
    })
  );

  const mesh: ForgeMesh = {
    pieces: [
      { key: 'stipe', attributes: finish(solid), cutout: false },
      { key: 'blade', attributes: finish(blades), cutout: true },
    ],
  };

  let height = 0;
  let spread = 0;
  for (const piece of mesh.pieces) {
    const positions = piece.attributes.positions;
    for (let i = 0; i < positions.length; i += 3) {
      height = Math.max(height, positions[i + 1]);
      spread = Math.max(spread, Math.hypot(positions[i], positions[i + 2]));
    }
  }

  return {
    mesh,
    metrics: {
      height,
      spread,
      stalk: Math.max(...stalks.map((stalk) => stalk.length)),
      stipes: stalks.length,
      blades: bladeCount,
      bladders: bladderCount,
    },
  };
}
