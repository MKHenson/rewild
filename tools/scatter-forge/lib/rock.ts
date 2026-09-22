// A rock is a field, not a mesh. `shape(d)` is the surface distance along a
// direction from the rock's centre, and the mesh and the bake both sample it,
// so a crack in the texture and a groove in the silhouette are one line. The
// solid is star-shaped: every surface point is visible from the centre, which
// is what lets a texel be mapped to a surface point with no rasterising.
//
// The base is a sphere with larger spheres scooped out of it, which is what
// gives a rock its concave faces meeting at rounded ridges. The six faces of a
// cube are still the six charts of the texture: a chart is a bundle of
// directions, not a piece of the shape, and a chart's gutter is baked with the
// surface that really continues past the face edge, so the mip chain never
// averages one face into a foreign colour.

import { createBuilder, finish, pushVertex, type Builder, type ForgeMesh, type MeshAttributes } from './mesh.ts';
import { fbm3r, ridged3r, smin, smoothstep, worley3Into, type Worley3Result } from './noise.ts';
import type { Params } from './params.ts';
import { beddingFrame, platesInto, type PlateField, type PlateSample } from './plates.ts';
import { createRng } from './rng.ts';
import { cross, normalize, type Vec3 } from './vec.ts';

/** Charts across one block and down it: the six faces of the cube. */
export const ROCK_CHART_COLUMNS = 3;
export const ROCK_CHART_ROWS = 2;

/**
 * Texels of real surface baked past each face's edge, as a fraction of the
 * chart. A fixed count would be a quarter of a pebble's 64-texel chart and an
 * eighth of a percent of a rock's 512-texel one, which is two different jobs.
 * Held at a proportion instead, so the gutter covers the same span of mip
 * chain whatever the chart, and never falls under the two texels a bilinear
 * tap at the edge needs.
 */
export function gutterOf(chartPx: number): number {
  return Math.max(2, Math.round(chartPx / 64));
}

/**
 * How one image is cut into charts.
 *
 * A **block** is one stone: six charts in 3x2, the cube's faces. A rock is one
 * block, so its image is 3x2 charts and this says nothing a constant could
 * not. A pebble cluster is one block per pebble, laid out in a grid of blocks,
 * because a stone painted from another stone's field would wear its lichen on
 * the wrong side.
 */
export interface ChartAtlas {
  /** Edge of one chart in texels, its gutter included. */
  chartPx: number;
  gutter: number;
  /** Blocks across the image and down it. */
  columns: number;
  rows: number;
  /** The image, in texels. */
  width: number;
  height: number;
}

/**
 * The atlas for `blocks` stones at this chart size. The grid is chosen to keep
 * the image about square: a block is three charts wide by two tall, so three
 * columns of blocks are as wide as two rows are tall.
 */
export function chartAtlas(chartPx: number, blocks: number): ChartAtlas {
  const columns = Math.max(1, Math.ceil(Math.sqrt(blocks / 1.5)));
  const rows = Math.max(1, Math.ceil(blocks / columns));

  return {
    chartPx,
    gutter: gutterOf(chartPx),
    columns,
    rows,
    width: chartPx * ROCK_CHART_COLUMNS * columns,
    height: chartPx * ROCK_CHART_ROWS * rows,
  };
}

/**
 * A sphere scooped out of the unit sphere, in unit-sphere space. It never
 * contains the centre, and its silhouette as seen from the centre lies
 * outside the rock, so a ray from the centre enters it once and the scooped
 * solid stays star-shaped.
 */
export interface Scoop {
  centre: Vec3;
  /** `|centre|²`, kept for the ray test. */
  distance2: number;
  radius: number;
}

export interface RockField {
  /** Half extents in metres along x, y and z, before relief. */
  extents: Vec3;
  scoops: Scoop[];
  /** `crease` in unit-sphere space, for the ridges between scoops. */
  creaseUnit: number;
  /** Metres the noise displaces the surface by. */
  relief: number;
  /** Metres across the largest lump of that noise. */
  reliefSize: number;
  reliefOctaves: number;
  /** Metres a crack groove cuts into the mesh. 0 without cracks. */
  groove: number;
  /** Width of a groove as a fraction of a crack cell. */
  grooveWidth: number;
  /** The slab pile the relief is mostly made of, or null for noise alone. */
  plates: PlateField | null;
  /** Share of the relief the plates take; the noise has the rest. */
  plateShare: number;
  /** Crack cells per metre. 0 draws none. */
  cracks: number;
  /** Row-major rotation taking world space into the bedding frame, bedding normal along y. */
  frame: number[];
  /** How far the cracks are flattened into the bedding, 0..1. */
  bedding: number;
  /** A second frame, for the veins, which cut across the bedding. */
  veinFrame: number[];
  /** Band the creases of the ridged noise are rounded over, in its own units. */
  ridgeSoften: number;
  seed: number;
  /** Metres from the rock's centre to its lowest point, so the origin sits there. */
  base: number;
}

/** What the emitted layer and the report are measured off. */
export interface RockMetrics {
  height: number;
  width: number;
  depth: number;
  /** Mean half extent, which sizes the relief and the footprint. */
  radius: number;
  /** Support points of the mesh in 26 directions, flat xyz, for the hull collider. */
  hull: number[];
}

export interface Rock {
  mesh: ForgeMesh;
  field: RockField;
  metrics: RockMetrics;
}

interface Face {
  normal: Vec3;
  u: Vec3;
  v: Vec3;
}

// Right-handed: u × v is the outward normal, so a grid walked +u then +v winds
// counter-clockwise seen from outside.
export const FACES: readonly Face[] = [
  { normal: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { normal: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { normal: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

/** A point on (or, past 0..1, beyond) a face, as a cube-space vector. */
export function cubePoint(into: Vec3, face: Face, a: number, b: number): Vec3 {
  const s = a * 2 - 1;
  const t = b * 2 - 1;
  into[0] = face.normal[0] + face.u[0] * s + face.v[0] * t;
  into[1] = face.normal[1] + face.u[1] * s + face.v[1] * t;
  into[2] = face.normal[2] + face.u[2] * s + face.v[2] * t;
  return into;
}

// Ridges are read at half again the lump frequency, and take this share of
// the relief: enough to crease the lumps, not enough to read as creases alone.
const RIDGE_OCTAVES = 2;
const RIDGE_SCALE = 1.5;
const RIDGE_SHARE = 0.25;

/**
 * An octave sum centred and widened to about -1..1 without a hard clamp. The
 * sum clusters around its mean, so it needs the gain to reach the range, and a
 * clamp at the range would flatten every peak into a plateau.
 */
function centred(sum: number, octaves: number): number {
  const spread = [0.29, 0.29, 0.2, 0.17, 0.16, 0.155][Math.min(5, octaves)] ?? 0.15;
  return Math.tanh(((sum - 0.5) / spread) * 0.8);
}

const _worley: Worley3Result = { f1: 0, f2: 0, id: 0 };
const _plate: PlateSample = { height: 0, id: 0 };

/** How much thinner crack cells are across the bedding at full bedding. */
const CRACK_FLATTEN = 1.6;
/** The fine octave's cells per coarse cell. */
const CRACK_FINE = 2.7;

/** The coarse crack network at a point. */
export interface CrackSample {
  /** Distance to the nearest cell border, in cells. 0 on the crack line. */
  edge: number;
  /** How much of a crack that border carries here, 0..1. Not every border is one. */
  presence: number;
  /** How wide the crack is here as a multiple of the nominal width: hairline to open. */
  width: number;
}

const _q: Vec3 = [0, 0, 0];

/**
 * The crack domain: the point taken into the bedding frame and squeezed
 * along the bedding normal, so the cells flatten and their borders run with
 * the bedding the way joints do, then warped so the borders wander rather
 * than run straight between points.
 */
function crackDomain(field: RockField, x: number, y: number, z: number): Vec3 {
  const f = field.frame;
  const qx = f[0] * x + f[1] * y + f[2] * z;
  const qy = (f[3] * x + f[4] * y + f[5] * z) * (1 + field.bedding * CRACK_FLATTEN);
  const qz = f[6] * x + f[7] * y + f[8] * z;

  const wobble = 0.3 / field.cracks;
  const s = field.cracks * 1.7;
  _q[0] = qx + (fbm3r(qx * s, qy * s, qz * s, 2, field.seed ^ 0x1f83d9ab) - 0.5) * wobble;
  _q[1] = qy + (fbm3r(qx * s, qy * s, qz * s, 2, field.seed ^ 0x5be0cd19) - 0.5) * wobble;
  _q[2] = qz + (fbm3r(qx * s, qy * s, qz * s, 2, field.seed ^ 0x3c6ef372) - 0.5) * wobble;
  return _q;
}

/**
 * The coarse crack network at a point, written into `into`. A crack is a
 * cell border, but not every border is drawn and no crack is one width: both
 * come off one slow noise along the network, so a crack opens where it is
 * strong and thins to nothing where it is not.
 */
export function crackCoarse(into: CrackSample, field: RockField, x: number, y: number, z: number): CrackSample {
  if (field.cracks <= 0) {
    into.edge = Infinity;
    into.presence = 0;
    into.width = 1;
    return into;
  }

  const q = crackDomain(field, x, y, z);
  const c = field.cracks;
  const w = worley3Into(_worley, q[0] * c, q[1] * c, q[2] * c, field.seed ^ 0x2545f491);
  into.edge = w.f2 - w.f1;

  const g = fbm3r(q[0] * c * 0.9, q[1] * c * 0.9, q[2] * c * 0.9, 2, field.seed ^ 0x7a1b3c5d);
  into.presence = smoothstep(0.4, 0.52, g);
  into.width = 0.45 + 1.1 * smoothstep(0.45, 0.7, g);
  return into;
}

/**
 * The fine crack octave, 1 on a line and 0 clear of one, for the texture
 * alone: at this scale a line is under a mesh quad, and cut into the mesh it
 * reads as dimples rather than cracks.
 */
export function crackFine(field: RockField, x: number, y: number, z: number, width: number): number {
  if (field.cracks <= 0) return 0;
  const q = crackDomain(field, x, y, z);
  const c = field.cracks * CRACK_FINE;
  const w = worley3Into(_worley, q[0] * c, q[1] * c, q[2] * c, field.seed ^ 0x27d4eb2d);
  const g = fbm3r(q[0] * c * 0.7, q[1] * c * 0.7, q[2] * c * 0.7, 2, field.seed ^ 0x3b9ac9ff);
  return (1 - smoothstep(0, width, w.f2 - w.f1)) * smoothstep(0.42, 0.55, g);
}

const _crack: CrackSample = { edge: 0, presence: 0, width: 1 };

/**
 * The coarse crack mask at a point: 1 in a crack, 0 clear of one, with a
 * rounded floor. `width` is a fraction of a cell. This is what the mesh cuts.
 */
export function crackMask(field: RockField, x: number, y: number, z: number, width: number): number {
  if (field.cracks <= 0) return 0;
  crackCoarse(_crack, field, x, y, z);
  return (1 - smoothstep(0, width * _crack.width, _crack.edge)) * _crack.presence;
}

/**
 * The surface point in direction `d`, written into `into`.
 *
 * Radial throughout — the base solid, the noise and the clip all move the
 * point along its own ray — so the result stays star-shaped whatever the keys.
 */
export function shape(into: Vec3, field: RockField, d: Vec3): Vec3 {
  // The unit sphere, with every scoop the ray enters cutting it back to where
  // the ray enters, the nearer taken smoothly so the ridge between two scoops
  // is rounded. Then the extents stretch it.
  let unit = 1;
  for (const scoop of field.scoops) {
    const b = d[0] * scoop.centre[0] + d[1] * scoop.centre[1] + d[2] * scoop.centre[2];
    // Behind the centre both roots are negative: the scoop is on the far side.
    if (b <= 0) continue;
    const disc = b * b - scoop.distance2 + scoop.radius * scoop.radius;
    if (disc <= 0) continue;
    unit = smin(unit, b - Math.sqrt(disc), field.creaseUnit);
  }

  const px = d[0] * unit * field.extents[0];
  const py = d[1] * unit * field.extents[1];
  const pz = d[2] * unit * field.extents[2];

  // The lump frequency is one over the lump size; every octave above it halves
  // the size and the amplitude, the way a terrain heightmap is built.
  const lumpScale = 1 / field.reliefSize;
  const ridgeScale = lumpScale * RIDGE_SCALE;
  const lumps = centred(fbm3r(px * lumpScale, py * lumpScale, pz * lumpScale, field.reliefOctaves, field.seed), field.reliefOctaves);
  const ridges = ridged3r(px * ridgeScale, py * ridgeScale, pz * ridgeScale, RIDGE_OCTAVES, field.seed ^ 0x9e3779b9, 0.5, field.ridgeSoften) * 2 - 1;
  const noise = lumps * (1 - RIDGE_SHARE) + ridges * RIDGE_SHARE;
  // Slab tops stand at the full relief and the gaps between them sit at its
  // negative, so a step from gap to top is the whole range.
  const slabs = field.plates ? platesInto(_plate, field.plates, px, py, pz).height * 2 - 1 : 0;
  const displaced = (noise * (1 - field.plateShare) + slabs * field.plateShare) * field.relief;
  const groove = field.groove > 0 ? crackMask(field, px, py, pz, field.grooveWidth) * field.groove : 0;

  // Applied along the ray, so an anisotropic rock keeps its relief in
  // proportion on every side.
  const along = Math.hypot(px, py, pz);
  const factor = along > 1e-6 ? (along + displaced - groove) / along : 1;
  into[0] = px * factor;
  into[1] = py * factor;
  into[2] = pz * factor;
  return into;
}

/** `shape` at a cube-space point, which need not lie on the cube. */
export function surfaceAt(into: Vec3, field: RockField, c: Vec3): Vec3 {
  return shape(into, field, normalize(c));
}

const _pa: Vec3 = [0, 0, 0];
const _pb: Vec3 = [0, 0, 0];
const _ca: Vec3 = [0, 0, 0];
const _cb: Vec3 = [0, 0, 0];
const _du: Vec3 = [0, 0, 0];
const _dv: Vec3 = [0, 0, 0];

/**
 * The surface normal at a face point, by central differences along the face's
 * own axes. A function of position alone, so the two sides of a chart seam
 * agree exactly and the seam never shades.
 */
export function normalAt(into: Vec3, field: RockField, face: Face, a: number, b: number, step: number): Vec3 {
  surfaceAt(_pa, field, cubePoint(_ca, face, a + step, b));
  surfaceAt(_pb, field, cubePoint(_cb, face, a - step, b));
  _du[0] = _pa[0] - _pb[0];
  _du[1] = _pa[1] - _pb[1];
  _du[2] = _pa[2] - _pb[2];

  surfaceAt(_pa, field, cubePoint(_ca, face, a, b + step));
  surfaceAt(_pb, field, cubePoint(_cb, face, a, b - step));
  _dv[0] = _pa[0] - _pb[0];
  _dv[1] = _pa[1] - _pb[1];
  _dv[2] = _pa[2] - _pb[2];

  const n = normalize(cross(_du, _dv));
  into[0] = n[0];
  into[1] = n[1];
  into[2] = n[2];
  return into;
}

/** Radians the bedding may tilt from horizontal. */
const BEDDING_TILT = 0.5;

// Band the ridge between two scoops rounds over at smoothing 1, as a fraction
// of the radius. A polynomial smooth minimum moves the surface by at most a
// quarter of its band, so 0.06 — the first cut — could round a ridge by 1.5%
// of the radius, which on a metre of rock is under a centimetre and under a
// mesh quad. The band has to be a quarter of the rock to read as rounding.
const CREASE_ROUND = 0.3;

/** Band the creases of the ridged noise round over at smoothing 1. */
const RIDGE_SOFTEN = 0.5;

/**
 * How far past the surface a scoop's silhouette, as seen from the centre, has
 * to lie. At exactly the surface the scoop would carve an overhang, which a
 * ray from the centre cannot represent.
 */
const SCOOP_CLEARANCE = 1.08;

/**
 * A scoop of the unit sphere: a sphere of `size` times its own distance from
 * the centre, sitting along `direction`, whose nearest point reaches `depth`
 * of the way in. `size` near 1 is a broad shallow face like a plane's; near
 * 0.5 a tight bite. The depth is held back where the geometry would overhang.
 */
export function scoopOf(direction: Vec3, size: number, depth: number): Scoop {
  const clearance = (SCOOP_CLEARANCE * (1 - size)) / Math.sqrt(1 - size * size);
  const reach = Math.max(1 - depth, clearance);
  const distance = reach / (1 - size);
  return {
    centre: [direction[0] * distance, direction[1] * distance, direction[2] * distance],
    distance2: distance * distance,
    radius: size * distance,
  };
}

/**
 * The field a config describes. Every random choice comes off the seed, so the
 * mesh, its tiers and its bake all read the same rock.
 */
export function rockField(params: Params): RockField {
  const rng = createRng(params.seed ^ 0x726f636b);
  const height = params.height;
  const width = params.width > 0 ? params.width : height * 1.3;
  const depth = params.depth > 0 ? params.depth : height;
  const extents: Vec3 = [width / 2, height / 2, depth / 2];
  const radius = (extents[0] + extents[1] + extents[2]) / 3;
  const frame = beddingFrame(rng, BEDDING_TILT);
  const veinFrame = beddingFrame(rng, Math.PI / 2);

  const field: RockField = {
    extents,
    scoops: [],
    creaseUnit: params.smoothing * CREASE_ROUND,
    relief: params.relief * radius,
    reliefSize: params.reliefSize,
    reliefOctaves: params.reliefOctaves,
    groove: params.cracks > 0 ? params.grooveDepth * radius : 0,
    grooveWidth: params.grooveWidth,
    plates:
      params.plates > 0
        ? {
            cells: params.plates,
            layers: params.plateLayers,
            bevel: params.plateBevel,
            lean: params.plateLean,
            bedding: params.bedding,
            frame,
            smoothing: params.smoothing,
            seed: params.seed ^ 0x706c6174,
          }
        : null,
    plateShare: params.plates > 0 ? params.plateShare : 0,
    cracks: params.cracks,
    frame,
    bedding: params.bedding,
    veinFrame,
    ridgeSoften: params.smoothing * RIDGE_SOFTEN,
    seed: params.seed,
    base: 0,
  };

  // Each scoop sits along its own random direction, at its own size and
  // depth about the keys, so no two faces of the rock are alike.
  for (let i = 0; i < params.scoops; i++) {
    const u = rng.range(-1, 1);
    const phi = rng.range(0, Math.PI * 2);
    const ring = Math.sqrt(1 - u * u);
    const direction: Vec3 = [Math.cos(phi) * ring, u, Math.sin(phi) * ring];
    const size = Math.min(SCOOP_SIZE_MAX, Math.max(SCOOP_SIZE_MIN, params.scoopSize * rng.range(0.85, 1.08)));
    field.scoops.push(scoopOf(direction, size, params.scoopDepth * rng.range(0.35, 1)));
  }

  return field;
}

/** The sizes a scoop is held to: under the floor it is a pit, over the ceiling a plane. */
const SCOOP_SIZE_MIN = 0.3;
const SCOOP_SIZE_MAX = 0.97;

/** The texel this block's chart for `faceIndex` starts at, written into `into`. */
export function chartOrigin(into: [number, number], atlas: ChartAtlas, block: number, faceIndex: number): [number, number] {
  const blockColumn = block % atlas.columns;
  const blockRow = Math.floor(block / atlas.columns);
  const column = blockColumn * ROCK_CHART_COLUMNS + (faceIndex % ROCK_CHART_COLUMNS);
  const row = blockRow * ROCK_CHART_ROWS + Math.floor(faceIndex / ROCK_CHART_COLUMNS);
  into[0] = column * atlas.chartPx;
  into[1] = row * atlas.chartPx;
  return into;
}

const _origin: [number, number] = [0, 0];

/** Where a face point lands in the image, 0..1 on both axes. */
export function chartUv(
  into: [number, number],
  atlas: ChartAtlas,
  block: number,
  faceIndex: number,
  a: number,
  b: number
): [number, number] {
  chartOrigin(_origin, atlas, block, faceIndex);
  const inner = atlas.chartPx - atlas.gutter * 2;
  into[0] = (_origin[0] + atlas.gutter + a * inner) / atlas.width;
  into[1] = (_origin[1] + atlas.gutter + b * inner) / atlas.height;
  return into;
}

/** Edge of one chart in texels: half the set's size, so six fit a 3x2 block. */
export function rockChartPx(params: Params): number {
  return params.textureSize / 2;
}

/** A rock is one block, so its image is one block of 3x2 charts. */
export function rockAtlas(params: Params): ChartAtlas {
  return chartAtlas(rockChartPx(params), 1);
}

/**
 * The 26 directions the hull is supported in: every non-zero combination of
 * -1, 0 and 1 on three axes.
 */
export function hullDirections(): Vec3[] {
  const out: Vec3[] = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) if (x || y || z) out.push(normalize([x, y, z]));
  return out;
}

/**
 * The mesh vertex furthest along each of 26 directions. Their hull touches the
 * true hull at those 26 points and sits inside it between them by no more
 * than the surface sags between two neighbouring directions.
 */
export function supportPoints(positions: Float32Array): number[] {
  const out: number[] = [];
  for (const direction of hullDirections()) {
    let best = -Infinity;
    let at = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const along = positions[i] * direction[0] + positions[i + 1] * direction[1] + positions[i + 2] * direction[2];
      if (along > best) {
        best = along;
        at = i;
      }
    }
    out.push(round(positions[at]), round(positions[at + 1]), round(positions[at + 2]));
  }
  return out;
}

const round = (value: number): number => Number(value.toFixed(3));

/**
 * Finite difference step for a vertex normal, as a fraction of a quad. At the
 * mesh's own scale, so the normal is that of the surface the triangles carry:
 * a step far finer than a quad reads every crease of the field, and a mesh
 * too coarse to hold that crease shades it as a hard triangle edge.
 */
const NORMAL_STEP = 0.35;

/**
 * One stone's six charts of vertices, written into a shared builder.
 *
 * `origin` is where the stone's lowest point sits, so a caller places a stone
 * by where it rests rather than by its centre. `block` is which block of the
 * atlas its charts are cut from: 0 for a rock, its own index for a pebble.
 */
export function pushStone(
  out: Builder,
  field: RockField,
  atlas: ChartAtlas,
  block: number,
  subdivisions: number,
  origin: Vec3
): void {
  const n = subdivisions;
  const step = NORMAL_STEP / n;
  const c: Vec3 = [0, 0, 0];
  const p: Vec3 = [0, 0, 0];
  const normal: Vec3 = [0, 0, 0];
  const uv: [number, number] = [0, 0];

  FACES.forEach((face, faceIndex) => {
    const first = out.positions.length / 3;

    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const a = i / n;
        const b = j / n;
        surfaceAt(p, field, cubePoint(c, face, a, b));
        normalAt(normal, field, face, a, b, step);
        chartUv(uv, atlas, block, faceIndex, a, b);
        pushVertex(
          out,
          [p[0] + origin[0], p[1] - field.base + origin[1], p[2] + origin[2]],
          [normal[0], normal[1], normal[2]],
          [uv[0], uv[1]],
          [0, 0, 0, 1]
        );
      }

    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const v00 = first + j * (n + 1) + i;
        const v10 = v00 + 1;
        const v01 = v00 + n + 1;
        const v11 = v01 + 1;
        out.indices.push(v00, v10, v11, v00, v11, v01);
      }
  });
}

const ORIGIN: Vec3 = [0, 0, 0];

function buildStone(params: Params, field: RockField): MeshAttributes {
  const out = createBuilder();
  pushStone(out, field, rockAtlas(params), 0, params.subdivisions, ORIGIN);
  return finish(out);
}

/**
 * The lowest point of the surface, found on a fine direction grid rather than
 * on the mesh, so every tier of one stone shares one origin.
 */
export function baseOf(field: RockField): number {
  const c: Vec3 = [0, 0, 0];
  const p: Vec3 = [0, 0, 0];
  const steps = 48;
  let lowest = Infinity;

  for (const face of FACES)
    for (let j = 0; j <= steps; j++)
      for (let i = 0; i <= steps; i++) {
        surfaceAt(p, field, cubePoint(c, face, i / steps, j / steps));
        if (p[1] < lowest) lowest = p[1];
      }

  return lowest;
}

export function buildRock(params: Params): Rock {
  const field = rockField(params);
  field.base = baseOf(field);

  const stone = buildStone(params, field);
  const positions = stone.positions;

  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }

  return {
    mesh: { pieces: [{ key: 'stone', attributes: stone, cutout: false }] },
    field,
    metrics: {
      height: maxY,
      width: maxX - minX,
      depth: maxZ - minZ,
      radius: (field.extents[0] + field.extents[1] + field.extents[2]) / 3,
      hull: supportPoints(positions),
    },
  };
}
