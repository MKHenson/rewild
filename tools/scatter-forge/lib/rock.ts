// A rock is a field, not a mesh. `shape(d)` is the surface distance along a
// direction from the rock's centre, and the mesh and the bake both sample it,
// so a crack in the texture and a groove in the silhouette are one line. The
// solid is star-shaped: every surface point is visible from the centre, which
// is what lets a texel be mapped to a surface point with no rasterising.
//
// The base is a cube pushed toward a sphere. Its six faces are the six charts
// of the texture, and a chart's gutter is baked with the surface that really
// continues past the face edge, so the mip chain never averages one face into
// a foreign colour.

import { createBuilder, finish, pushVertex, type ForgeMesh, type MeshAttributes } from './mesh.ts';
import { fbm3, ridged3, smoothstep, worley3Into, type Worley3Result } from './noise.ts';
import type { Params } from './params.ts';
import { beddingFrame, platesInto, type PlateField, type PlateSample } from './plates.ts';
import { createRng } from './rng.ts';
import { cross, dot, normalize, type Vec3 } from './vec.ts';

/** Texels of real surface baked past each face's edge. */
export const ROCK_GUTTER = 8;

/** Charts across the image and down it. */
export const ROCK_CHART_COLUMNS = 3;
export const ROCK_CHART_ROWS = 2;

/** Half-space the rock is clipped to: keep `dot(p, normal) <= distance`. */
export interface Cleave {
  normal: Vec3;
  distance: number;
}

export interface RockField {
  /** Half extents in metres along x, y and z, before relief. */
  extents: Vec3;
  roundness: number;
  /** Metres the noise displaces the surface by. */
  relief: number;
  /** Metres across the largest lump of that noise. */
  reliefSize: number;
  reliefOctaves: number;
  /** Metres a crack groove cuts into the mesh. 0 without cracks. */
  groove: number;
  /** Width of a groove as a fraction of a crack cell. */
  grooveWidth: number;
  /** Share of the relief a cleaved facet keeps, 0..1. Grooves cut it in full. */
  facetRelief: number;
  /** The slab pile the relief is mostly made of, or null for noise alone. */
  plates: PlateField | null;
  /** Share of the relief the plates take; the noise has the rest. */
  plateShare: number;
  /** Crack cells per metre. 0 draws none. */
  cracks: number;
  cleaves: Cleave[];
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

/**
 * The crack mask at a point: 1 in a crack, 0 clear of one. Two octaves, the
 * second finer and fainter. `width` is a fraction of a cell.
 */
export function crackMask(field: RockField, x: number, y: number, z: number, width: number): number {
  if (field.cracks <= 0) return 0;

  // Warped so the cell borders wander rather than run straight between points.
  const wobble = 0.35 / field.cracks;
  const wx = x + (fbm3(x * 2, y * 2, z * 2, 2, field.seed ^ 0x1f83d9ab) - 0.5) * wobble;
  const wy = y + (fbm3(x * 2, y * 2, z * 2, 2, field.seed ^ 0x5be0cd19) - 0.5) * wobble;
  const wz = z + (fbm3(x * 2, y * 2, z * 2, 2, field.seed ^ 0x3c6ef372) - 0.5) * wobble;

  const coarse = worley3Into(_worley, wx * field.cracks, wy * field.cracks, wz * field.cracks, field.seed ^ 0x2545f491);
  let mask = 1 - smoothstep(0, width, coarse.f2 - coarse.f1);

  const fineScale = field.cracks * 2.7;
  const fine = worley3Into(_worley, wx * fineScale, wy * fineScale, wz * fineScale, field.seed ^ 0x27d4eb2d);
  mask = Math.max(mask, (1 - smoothstep(0, width * 0.7, fine.f2 - fine.f1)) * 0.55);

  return mask;
}

/**
 * The surface point in direction `d`, written into `into`.
 *
 * Radial throughout — the base solid, the noise and the clip all move the
 * point along its own ray — so the result stays star-shaped whatever the keys.
 */
export function shape(into: Vec3, field: RockField, d: Vec3): Vec3 {
  const ax = Math.abs(d[0]);
  const ay = Math.abs(d[1]);
  const az = Math.abs(d[2]);
  const largest = Math.max(ax, ay, az);

  // The cube's surface in this direction is at 1 / largest; the sphere's at 1.
  const cube = 1 / largest;
  let r = cube + (1 - cube) * field.roundness;

  const px = d[0] * r * field.extents[0];
  const py = d[1] * r * field.extents[1];
  const pz = d[2] * r * field.extents[2];

  // The lump frequency is one over the lump size; every octave above it halves
  // the size and the amplitude, the way a terrain heightmap is built.
  const lumpScale = 1 / field.reliefSize;
  const ridgeScale = lumpScale * RIDGE_SCALE;
  const lumps = centred(fbm3(px * lumpScale, py * lumpScale, pz * lumpScale, field.reliefOctaves, field.seed), field.reliefOctaves);
  const ridges = ridged3(px * ridgeScale, py * ridgeScale, pz * ridgeScale, RIDGE_OCTAVES, field.seed ^ 0x9e3779b9) * 2 - 1;
  const noise = lumps * (1 - RIDGE_SHARE) + ridges * RIDGE_SHARE;
  // Slab tops stand at the full relief and the gaps between them sit at its
  // negative, so a step from gap to top is the whole range.
  const slabs = field.plates ? platesInto(_plate, field.plates, px, py, pz).height * 2 - 1 : 0;
  const displaced = (noise * (1 - field.plateShare) + slabs * field.plateShare) * field.relief;
  const groove = field.groove > 0 ? crackMask(field, px, py, pz, field.grooveWidth) * field.groove : 0;

  // Applied as a fraction of the radial distance, so an anisotropic rock keeps
  // its relief in proportion on every side.
  const along = Math.hypot(px, py, pz);
  const factor = along > 1e-6 ? (along + displaced - groove) / along : 1;

  into[0] = px * factor;
  into[1] = py * factor;
  into[2] = pz * factor;

  let clipped = false;
  for (const cleave of field.cleaves) {
    const h = dot(into, cleave.normal);
    if (h > cleave.distance) {
      const t = cleave.distance / h;
      into[0] *= t;
      into[1] *= t;
      into[2] *= t;
      clipped = true;
    }
  }

  // The clip lands the point on the plane, which loses the surface it had. A
  // facet keeps a share of it and every groove, still along its own ray.
  if (clipped) {
    const onFacet = Math.hypot(into[0], into[1], into[2]);
    const keep = onFacet > 1e-6 ? (onFacet + displaced * field.facetRelief - groove) / onFacet : 1;
    into[0] *= keep;
    into[1] *= keep;
    into[2] *= keep;
  }

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

/** Fraction of the base radius a cleave sits at: 0.6 cuts a broad facet, 0.9 a nick. */
const CLEAVE_NEAR = 0.6;
const CLEAVE_FAR = 0.9;

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

  const field: RockField = {
    extents,
    roundness: params.roundness,
    relief: params.relief * radius,
    reliefSize: params.reliefSize,
    reliefOctaves: params.reliefOctaves,
    groove: params.cracks > 0 ? params.grooveDepth * radius : 0,
    grooveWidth: params.grooveWidth,
    facetRelief: params.facetRelief,
    plates:
      params.plates > 0
        ? {
            cells: params.plates,
            layers: params.plateLayers,
            bevel: params.plateBevel,
            lean: params.plateLean,
            bedding: params.bedding,
            frame: beddingFrame(rng, BEDDING_TILT),
            seed: params.seed ^ 0x706c6174,
          }
        : null,
    plateShare: params.plates > 0 ? params.plateShare : 0,
    cracks: params.cracks,
    cleaves: [],
    seed: params.seed,
    base: 0,
  };

  // Each plane sits a fraction of the way out along its own normal, measured
  // against the uncleaved surface there, so a facet is the same size on a slab
  // as on a sphere.
  const probe: Vec3 = [0, 0, 0];
  for (let i = 0; i < params.cleaves; i++) {
    const u = rng.range(-1, 1);
    const phi = rng.range(0, Math.PI * 2);
    const ring = Math.sqrt(1 - u * u);
    const normal: Vec3 = [Math.cos(phi) * ring, u, Math.sin(phi) * ring];
    const reach = dot(shape(probe, field, normal), normal);
    field.cleaves.push({ normal, distance: reach * rng.range(CLEAVE_NEAR, CLEAVE_FAR) });
  }

  return field;
}

/** Where a face point lands in the image, 0..1 on both axes. */
export function chartUv(into: [number, number], faceIndex: number, a: number, b: number, chartPx: number): [number, number] {
  const column = faceIndex % ROCK_CHART_COLUMNS;
  const row = Math.floor(faceIndex / ROCK_CHART_COLUMNS);
  const inner = chartPx - ROCK_GUTTER * 2;
  into[0] = (column * chartPx + ROCK_GUTTER + a * inner) / (chartPx * ROCK_CHART_COLUMNS);
  into[1] = (row * chartPx + ROCK_GUTTER + b * inner) / (chartPx * ROCK_CHART_ROWS);
  return into;
}

/** Edge of one chart in texels: half the set's size, so six fit a 3x2 image. */
export function rockChartPx(params: Params): number {
  return params.textureSize / 2;
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

/** Finite difference step for a vertex normal, in face units. */
const NORMAL_STEP = 1e-3;

function buildStone(params: Params, field: RockField): MeshAttributes {
  const out = createBuilder();
  const n = params.subdivisions;
  const chartPx = rockChartPx(params);
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
        normalAt(normal, field, face, a, b, NORMAL_STEP);
        chartUv(uv, faceIndex, a, b, chartPx);
        pushVertex(out, [p[0], p[1] - field.base, p[2]], [normal[0], normal[1], normal[2]], [uv[0], uv[1]], [0, 0, 0, 1]);
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

  return finish(out);
}

/**
 * The lowest point of the surface, found on a fine direction grid rather than
 * on the mesh, so every tier of one rock shares one origin.
 */
function baseOf(field: RockField): number {
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
