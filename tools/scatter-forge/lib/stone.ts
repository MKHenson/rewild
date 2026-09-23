// The stone image: six cube charts, every texel a point on the rock's own
// surface. Nothing here reads a UV. A texel is mapped to a direction, the
// direction to a surface point, and the grain, the cracks and the weathering
// are all functions of that point and its normal — which is why a crack runs
// into a chart's gutter and out the neighbouring chart without a break.
//
// What makes stone read as stone is fine structure at every scale down to the
// texel, so the painter is layered: a slow tone, a cellular mineral grain, a
// texel-scale grit, veins, cracks, staining, then the weathering that sits on
// top of all of it. Every layer writes the height too, so the normal map
// carries the same detail the colour does.

import { laminaInto, type LaminaSample } from './laminae.ts';
import { fbm3r, hash3, smoothstep, worley3Into, type Worley3Result } from './noise.ts';
import type { Params } from './params.ts';
import { platesInto, type PlateSample } from './plates.ts';
import {
  chartOrigin,
  crackCoarse,
  crackFine,
  cubePoint,
  FACES,
  rockAtlas,
  surfaceAt,
  type ChartAtlas,
  type CrackSample,
  type RockField,
} from './rock.ts';
import type { Cluster } from './pebbles.ts';
import { createCanvas, type Canvas, type Canvases } from './textures.ts';
import type { Vec3 } from './vec.ts';
import type { VesicleSample } from './vesicles.ts';

type Rgb = [number, number, number];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const fract = (v: number): number => v - Math.floor(v);
const luminance = (c: Rgb): number => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

function parseHex(value: string, field: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(value);
  if (!match) throw new Error(`${field} must be a six digit hex colour, got '${value}'.`);
  const n = parseInt(match[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const mulRgb = (a: Rgb, b: Rgb): Rgb => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

/** Every look value the painter reads, parsed once, and the colours derived from them. */
interface Palette {
  mid: Rgb;
  dark: Rgb;
  light: Rgb;
  soil: Rgb;
  /** The three minerals of the grain: the dark flakes, the glassy grey and the pale bulk. */
  biotite: Rgb;
  quartz: Rgb;
  feldspar: Rgb;
  vein: Rgb;
  /** Iron staining, as a tint at unit luminance and as the colour itself. */
  rust: Rgb;
  rustTint: Rgb;
  /** The weathering crust: its dark heart and its thinner brown margin. */
  patina: Rgb;
  patinaThin: Rgb;
  /** The lichens: the common pale disc, its grey-blue neighbour, the rare yellow one, and a disc's darker heart. */
  lichen: Rgb;
  lichenGrey: Rgb;
  lichenYellow: Rgb;
  lichenHeart: Rgb;
  /** The bleached colour a worn edge weathers to. */
  edge: Rgb;
  /** Snow in the light, and snow in its own shadow. */
  snow: Rgb;
  snowShadow: Rgb;
  /** What the run-off leaves behind, and how dark it is. */
  streak: Rgb;
  streakLum: number;
  /** What the faces that look up are multiplied by: topTint read with mid grey as one. */
  wash: Rgb;
  /** The metallic flakes in the grain. */
  glint: Rgb;
  /** The colour the odd standout bed takes, outside the stone's own ramp. */
  lamina: Rgb;
  /** The mineral a filled hole holds, and the dark glass a hole is lined with. */
  amygdale: Rgb;
  holeFloor: Rgb;
}

function paletteOf(params: Params): Palette {
  const mid = parseHex(params.stoneTint, 'stoneTint');
  const dark = parseHex(params.stoneDark, 'stoneDark');
  const light = parseHex(params.stoneLight, 'stoneLight');
  const lichen = parseHex(params.lichenTint, 'lichenTint');
  const rust = parseHex(params.stainTint, 'stainTint');
  const rustLum = Math.max(0.05, luminance(rust));

  return {
    mid,
    dark,
    light,
    soil: parseHex(params.soilTint, 'soilTint'),
    biotite: mixRgb(dark, mid, 0.2),
    quartz: mixRgb(mixRgb(mid, dark, 0.15), [0.5, 0.55, 0.62], 0.12),
    feldspar: mixRgb(light, [0.8, 0.7, 0.64], 0.15),
    vein: mixRgb(light, [0.9, 0.87, 0.82], 0.35),
    rust,
    rustTint: [rust[0] / rustLum, rust[1] / rustLum, rust[2] / rustLum],
    patina: [0.14, 0.115, 0.115],
    patinaThin: [0.27, 0.22, 0.19],
    lichen,
    lichenGrey: mixRgb(lichen, [0.55, 0.6, 0.6], 0.6),
    lichenYellow: [0.8, 0.66, 0.18],
    lichenHeart: mulRgb(lichen, [0.62, 0.6, 0.5]),
    edge: parseHex(params.edgeTint, 'edgeTint'),
    snow: [0.92, 0.935, 0.95],
    snowShadow: [0.72, 0.79, 0.9],
    streak: parseHex(params.streakTint, 'streakTint'),
    streakLum: luminance(parseHex(params.streakTint, 'streakTint')),
    wash: mulRgb(parseHex(params.topTint, 'topTint'), [2, 2, 2]),
    glint: parseHex(params.glintTint, 'glintTint'),
    lamina: parseHex(params.laminaeAccent, 'laminaeAccent'),
    amygdale: parseHex(params.amygdaleTint, 'amygdaleTint'),
    holeFloor: mulRgb(dark, [0.45, 0.45, 0.45]),
  };
}

/** One chart's surface, before anything is painted on it. */
interface Surface {
  /** xyz per texel, in the rock's centred space. */
  points: Float32Array;
  /** Distance from the centre per texel. */
  radius: Float32Array;
  /**
   * The hole under every texel, as `VesicleSample` reads it, four floats a
   * texel: cover, pit, scale and filled. Null for a rock with no holes. Read
   * with the surface, off the face before the pits were cut, so the floor of a
   * pit the mesh carries is still inside its hole.
   */
  holes: Float32Array | null;
}

const _hole: VesicleSample = { cover: 0, pit: 0, scale: 0, filled: 0, id: 0, cut: 0 };

const _c: Vec3 = [0, 0, 0];
const _p: Vec3 = [0, 0, 0];

/**
 * The surface under every texel of one chart, gutter included. A gutter texel
 * is a face coordinate just past 0..1, which is a direction just past the
 * face's edge: the neighbouring face's own surface, in this chart's frame.
 */
function sampleSurface(field: RockField, faceIndex: number, atlas: ChartAtlas): Surface {
  const face = FACES[faceIndex];
  const { chartPx, gutter } = atlas;
  const inner = chartPx - gutter * 2;
  const points = new Float32Array(chartPx * chartPx * 3);
  const radius = new Float32Array(chartPx * chartPx);
  const holes = field.vesicles ? new Float32Array(chartPx * chartPx * 4) : null;

  for (let y = 0; y < chartPx; y++) {
    const b = (y - gutter + 0.5) / inner;
    for (let x = 0; x < chartPx; x++) {
      const a = (x - gutter + 0.5) / inner;
      surfaceAt(_p, field, cubePoint(_c, face, a, b), holes ? _hole : undefined);
      const i = y * chartPx + x;
      if (holes) {
        holes[i * 4] = _hole.cover;
        holes[i * 4 + 1] = _hole.pit;
        holes[i * 4 + 2] = _hole.scale;
        holes[i * 4 + 3] = _hole.filled;
      }
      points[i * 3] = _p[0];
      points[i * 3 + 1] = _p[1];
      points[i * 3 + 2] = _p[2];
      radius[i] = Math.hypot(_p[0], _p[1], _p[2]);
    }
  }

  return { points, radius, holes };
}

const _du: Vec3 = [0, 0, 0];
const _dv: Vec3 = [0, 0, 0];

/** Central differences over the texel grid, one-sided at the chart's border. */
function normalOf(into: Vec3, surface: Surface, chartPx: number, x: number, y: number): Vec3 {
  const { points } = surface;
  const xa = Math.max(0, x - 1);
  const xb = Math.min(chartPx - 1, x + 1);
  const ya = Math.max(0, y - 1);
  const yb = Math.min(chartPx - 1, y + 1);

  const ia = (y * chartPx + xa) * 3;
  const ib = (y * chartPx + xb) * 3;
  _du[0] = points[ib] - points[ia];
  _du[1] = points[ib + 1] - points[ia + 1];
  _du[2] = points[ib + 2] - points[ia + 2];

  const ja = (ya * chartPx + x) * 3;
  const jb = (yb * chartPx + x) * 3;
  _dv[0] = points[jb] - points[ja];
  _dv[1] = points[jb + 1] - points[ja + 1];
  _dv[2] = points[jb + 2] - points[ja + 2];

  const nx = _du[1] * _dv[2] - _du[2] * _dv[1];
  const ny = _du[2] * _dv[0] - _du[0] * _dv[2];
  const nz = _du[0] * _dv[1] - _du[1] * _dv[0];
  const length = Math.hypot(nx, ny, nz) || 1;
  into[0] = nx / length;
  into[1] = ny / length;
  into[2] = nz / length;
  return into;
}

/**
 * How sharply the surface bends at a texel, from the radius of its neighbours
 * `reach` texels away: positive on a ridge or a cleave crease, negative in a
 * hollow. Scaled by the texel spacing so a crease of a given angle reads the
 * same at any resolution.
 */
function curvatureOf(surface: Surface, atlas: ChartAtlas, x: number, y: number, reach: number): number {
  const { chartPx, gutter } = atlas;
  const { radius } = surface;
  const xa = Math.max(0, x - reach);
  const xb = Math.min(chartPx - 1, x + reach);
  const ya = Math.max(0, y - reach);
  const yb = Math.min(chartPx - 1, y + reach);
  const centre = radius[y * chartPx + x];
  const sum = radius[y * chartPx + xa] + radius[y * chartPx + xb] + radius[ya * chartPx + x] + radius[yb * chartPx + x];
  const spacing = (2 / (chartPx - gutter * 2)) * reach;
  return (4 * centre - sum) / (centre * spacing);
}

const _worley: Worley3Result = { f1: 0, f2: 0, id: 0 };
const _crack: CrackSample = { edge: 0, presence: 0, width: 1 };
const _n: Vec3 = [0, 0, 0];
const _plate: PlateSample = { height: 0, id: 0 };
const _lamina: LaminaSample = { id: 0, hardness: 0, parting: 0, accent: 0 };
const _package: LaminaSample = { id: 0, hardness: 0, parting: 0, accent: 0 };

// Half the range an octave sum occupies, by octave count, as `noise.ts` measures it.
const TONE_SPREAD = [0.29, 0.29, 0.2, 0.17, 0.16, 0.155];

/** Octaves of the undulation, and the half range that many occupy. */
const UNDULATION_OCTAVES = 3;
const UNDULATION_SPREAD = TONE_SPREAD[UNDULATION_OCTAVES];

/**
 * An octave sum as a 0..1 tone: centred, widened to the range it occupies,
 * then pulled toward the middle by how little contrast is wanted.
 */
function toneOf(sum: number, octaves: number, contrast: number): number {
  const spread = TONE_SPREAD[Math.min(5, octaves)] ?? 0.15;
  const centred = Math.tanh(((sum - 0.5) / spread) * 0.9);
  return 0.5 + centred * 0.5 * contrast;
}

/** Dark to mid over the lower half of `t`, mid to light over the upper. */
function ramp(dark: number, mid: number, light: number, t: number): number {
  return t < 0.5 ? mix(dark, mid, t * 2) : mix(mid, light, (t - 0.5) * 2);
}

/** Cells per metre of the texel-scale grit under everything. */
const GRIT_SCALE = 380;
/** Cells per metre of the lichen discs; one disc at most per cell. */
const LICHEN_CELLS = 12;
/** Cells per metre of the areolae a crust is cracked into. */
const AREOLA_CELLS = 170;
/** Cycles per metre of the vein field, and how far it is stretched along the vein direction. */
const VEIN_SCALE = 4;
const VEIN_STRETCH = 0.16;
/** Cycles per metre of the stain patches, and how far they flatten into bands along the bedding. */
const STAIN_SCALE = 1.6;
const STAIN_BANDING = 3;
/** Cycles per metre of the patina's growth, and of the fine edge that makes it a skin. */
const PATINA_SCALE = 3;
const PATINA_EDGE = 22;
/** Cycles per metre of the foliation hairlines, across the bedding and along it. */
const FOLIATION_ACROSS = 38;
const FOLIATION_ALONG = 2.5;
/** Cycles per metre of the colonies the lichen gathers in. */
const COLONY_SCALE = 1.2;
/** Cycles per metre of the patchiness in the edge wear, and of the drifts in the snow. */
const WEAR_SCALE = 3;
const SNOW_SCALE = 5;
/** Cycles per metre of the drift in the wash's margin. */
const WASH_SCALE = 2;
/** Cycles per metre of the snow's mottling, and of the lumps it drifts into. */
const SNOW_MOTTLE = 18;
const SNOW_LUMPS = 7;

/** Share of the cells that hold a flake at glint 1. */
const GLINT_SHARE = 0.22;
/** How far a shard sits below the stone around it, in height units. */
const GLINT_INSET = 0.13;

/**
 * How far a flake's half extents reach across its own cell, and how far its
 * centre strays from the cell's. The two together bound how far a flake
 * reaches, which is what lets the search stop at the neighbouring cells.
 */
const FLAKE_EXTENT = 0.45;
const FLAKE_JITTER = 0.25;
const FLAKE_REACH = (FLAKE_EXTENT * Math.sqrt(3) + FLAKE_JITTER + 0.5) ** 2;

/** One metallic flake under a point. */
interface FlakeSample {
  /** 1 inside the shard, 0 clear of it, with a texel of softness at its edge. */
  cover: number;
  /** The flake's own random value, 0..1. */
  id: number;
}

const _flake: FlakeSample = { cover: 0, id: 0 };

/**
 * The metallic flake under a point: mica or pyrite, grown as a little
 * crystal rather than a speck.
 *
 * A share of the cells of a lattice hold one. A flake is a box at its own
 * random orientation and its own three half extents, so where the surface
 * cuts it the outline is a polygon with straight edges and corners — a shard,
 * which is what the eye reads as a mineral rather than as a dot.
 */
function flakeAt(into: FlakeSample, x: number, y: number, z: number, cells: number, share: number, seed: number): FlakeSample {
  into.cover = 0;
  into.id = 0;
  if (share <= 0) return into;

  const fx = x * cells;
  const fy = y * cells;
  const fz = z * cells;
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);
  const cz = Math.floor(fz);

  for (let oz = -1; oz <= 1; oz++)
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox;
        const gy = cy + oy;
        const gz = cz + oz;

        // Most cells hold no flake, so the cheap draw gates the rest.
        const id = hash3(gx, gy, gz, seed ^ 0x51ed270b);
        if (id > share) continue;

        const dx = fx - (gx + 0.5 + (hash3(gx, gy, gz, seed) - 0.5) * 2 * FLAKE_JITTER);
        const dy = fy - (gy + 0.5 + (hash3(gx, gy, gz, seed ^ 0x9e3779b9) - 0.5) * 2 * FLAKE_JITTER);
        const dz = fz - (gz + 0.5 + (hash3(gx, gy, gz, seed ^ 0x3c6ef372) - 0.5) * 2 * FLAKE_JITTER);
        if (dx * dx + dy * dy + dz * dz > FLAKE_REACH) continue;

        // The box's own frame: one random axis, and two perpendicular to it.
        const u = hash3(gx, gy, gz, seed ^ 0x165667b1) * 2 - 1;
        const phi = hash3(gx, gy, gz, seed ^ 0x27d4eb2d) * TWO_PI;
        const ring = Math.sqrt(Math.max(0, 1 - u * u));
        const ax = Math.cos(phi) * ring;
        const ay = u;
        const az = Math.sin(phi) * ring;
        // Perpendicular to it, crossed against whichever reference axis this
        // one is furthest from, so the cross never collapses.
        const upright = Math.abs(ay) < 0.9;
        let bx = upright ? -az : 0;
        let by = upright ? 0 : az;
        let bz = upright ? ax : -ay;
        const bl = Math.hypot(bx, by, bz) || 1;
        bx /= bl;
        by /= bl;
        bz /= bl;
        const ex = ay * bz - az * by;
        const ey = az * bx - ax * bz;
        const ez = ax * by - ay * bx;

        // Three unequal half extents, so a shard is a slab or a wedge and
        // never a cube: the faces read at different sizes as it turns.
        const h0 = FLAKE_EXTENT * (0.35 + 0.65 * hash3(gx, gy, gz, seed ^ 0x7f4a7c15));
        const h1 = FLAKE_EXTENT * (0.5 + 0.5 * hash3(gx, gy, gz, seed ^ 0x2545f491));
        const h2 = FLAKE_EXTENT * (0.5 + 0.5 * hash3(gx, gy, gz, seed ^ 0x5bd1e995));

        const p0 = Math.abs(dx * ax + dy * ay + dz * az) / h0;
        const p1 = Math.abs(dx * bx + dy * by + dz * bz) / h1;
        const p2 = Math.abs(dx * ex + dy * ey + dz * ez) / h2;
        const edge = Math.max(p0, p1, p2);
        const cover = 1 - smoothstep(0.86, 1, edge);
        if (cover <= into.cover) continue;

        into.cover = cover;
        into.id = id / share;
      }

  return into;
}

/** Half width of a trail at its head, in metres, from this to twice it. The tail is a sixth of it. */
const STREAK_WIDTH = 0.018;
/** How far a trail wanders sideways over its length, in metres. */
const STREAK_WANDER = 0.06;
/** How far a branch leaves its trail by the end, in metres. */
const STREAK_BRANCH = 0.07;
/** How fast a trail sheds its load, from this to twice it: the film at t down its run is (1 - t) to this. */
const STREAK_DECAY = 1.1;
/** Cycles per metre of the rivulets within a trail, around the rock and down it. */
const RIVULET_AROUND = 30;
const RIVULET_DOWN = 3;
/** Floats per streak in a source table: azimuth, head height, run length, head half width, splat reach, splat opacity, decay, branch side (0, -1 or 1). */
const STREAK_STRIDE = 8;

const TWO_PI = Math.PI * 2;

/**
 * Where each streak starts and how it runs. One azimuth per streak, jittered
 * so the spacing is uneven, a head at its own height up the side, and a run,
 * a width, a splat and a decay of its own, so no two trails are one trail.
 * Rolled once, so every chart reads the same table.
 */
function streakSources(field: RockField, count: number, height: number): Float32Array {
  const seed = field.seed ^ 0x73747265;
  const sources = new Float32Array(count * STREAK_STRIDE);

  for (let k = 0; k < count; k++) {
    const o = k * STREAK_STRIDE;
    sources[o] = ((k + hash3(k, 2, 0, seed)) * TWO_PI) / count;
    sources[o + 1] = field.base + height * (0.4 + 0.6 * hash3(k, 3, 0, seed));
    sources[o + 2] = height * (0.15 + 0.85 * hash3(k, 4, 0, seed));
    sources[o + 3] = STREAK_WIDTH * (1 + hash3(k, 5, 0, seed));
    sources[o + 4] = 0.8 + 0.6 * hash3(k, 8, 0, seed);
    sources[o + 5] = 0.45 + 0.35 * hash3(k, 9, 0, seed);
    sources[o + 6] = STREAK_DECAY * (1 + hash3(k, 10, 0, seed));
    sources[o + 7] = hash3(k, 6, 0, seed) < 0.6 ? (hash3(k, 7, 0, seed) < 0.5 ? -1 : 1) : 0;
  }

  return sources;
}

interface StreakSample {
  /** The run-off film: 0 clear of every streak, 1 at a head. */
  film: number;
  /** How far down its run the strongest trail here is, 0 at the head. */
  t: number;
}

const _run: StreakSample = { film: 0, t: 0 };

/**
 * The run-off at a point. Streaks live on a cylinder about the rock's up
 * axis, so each runs straight down under gravity. A streak is a splat where
 * the drop landed, a trail that wanders a little and is full at its head
 * and sheds its load as it goes, so it thins and fades together, and
 * sometimes a thinner branch that leaves it part way down.
 */
function streakAt(into: StreakSample, sources: Float32Array, field: RockField, theta: number, y: number, lateral: number, steep: number): StreakSample {
  const seed = field.seed ^ 0x73747265;
  into.film = 0;
  into.t = 0;

  for (let o = 0; o < sources.length; o += STREAK_STRIDE) {
    let dTheta = theta - sources[o];
    dTheta -= Math.round(dTheta / TWO_PI) * TWO_PI;
    // Sideways distance in metres at this height, so a streak is one width
    // whatever the rock's girth is here.
    const across = dTheta * lateral;
    const headWidth = sources[o + 3];
    if (Math.abs(across) > headWidth * 4 + STREAK_WANDER + STREAK_BRANCH) continue;

    // The splat, a little wider than it is tall, and fainter than the trail's head.
    const top = sources[o + 1];
    const reach = headWidth * sources[o + 4];
    const splat = (1 - smoothstep(reach * 1.2, reach * 3, Math.hypot(across, (y - top) * 1.4))) * sources[o + 5];
    if (splat > into.film) {
      into.film = splat;
      into.t = 0;
    }

    // A drop only runs where the face is steep enough to run down; on a
    // face that looks up it lies where it landed.
    const below = top - y;
    const length = sources[o + 2];
    if (steep <= 0 || below < 0 || below > length) continue;
    const t = below / length;
    const wander = (fbm3r(below * 4, (o / STREAK_STRIDE) * 7.3, 0.5, 2, seed) - 0.5) * STREAK_WANDER * Math.sqrt(t);
    // Thick at the head, a hairline at the tail: the width and the edge's
    // softness both taper, or the blur alone sets the width the eye reads.
    const halfWidth = headWidth * (1 - 0.85 * t);
    const fade = Math.pow(1 - t, sources[o + 6]);
    const trail = (1 - smoothstep(halfWidth * 0.5, halfWidth * 1.3, Math.abs(across - wander))) * fade * steep;
    if (trail > into.film) {
      into.film = trail;
      into.t = t;
    }

    const side = sources[o + 7];
    if (side !== 0 && t > 0.35) {
      const offset = side * STREAK_BRANCH * ((t - 0.35) / 0.65);
      const branch = (1 - smoothstep(halfWidth * 0.3, halfWidth * 0.9, Math.abs(across - wander - offset))) * fade * 0.7 * steep;
      if (branch > into.film) {
        into.film = branch;
        into.t = t;
      }
    }
  }

  return into;
}

const DRIP_STEPS = 5;

/**
 * The chart the curvature reaches below were tuned against. A reach is a span
 * of surface, not a count of texels, so it is scaled to whatever chart it is
 * read at: 28 texels is a twentieth of a rock's chart and half of a pebble's,
 * and at half a chart the mask stops finding edges and finds the whole stone.
 */
const REACH_CHART = 512;

const _reach: [number, number, number, number, number] = [1, 4, 8, 12, 28];

/** The reaches at this chart, never under one texel. */
function reachesOf(atlas: ChartAtlas): typeof _reach {
  const scale = atlas.chartPx / REACH_CHART;
  return [1, 4, 8, 12, 28].map((texels) => Math.max(1, Math.round(texels * scale))) as typeof _reach;
}

/**
 * One stone's chart, painted into its block of the image.
 *
 * `block` is which stone this is. A rock is block 0 of a one-block atlas. A
 * pebble is its own index, so the marks read off `up` and off the surface's
 * own curvature land on the stone that actually carries them.
 */
function paintChart(
  canvas: Canvas,
  params: Params,
  field: RockField,
  palette: Palette,
  sources: Float32Array,
  atlas: ChartAtlas,
  block: number,
  faceIndex: number
): void {
  const chartPx = atlas.chartPx;
  const surface = sampleSurface(field, faceIndex, atlas);
  const reaches = reachesOf(atlas);
  const origin: [number, number] = [0, 0];
  chartOrigin(origin, atlas, block, faceIndex);
  const stride = canvas.width;
  const weathering = params.weathering;
  const toneScale = 1 / params.toneSize;
  const toneOctaves = params.toneOctaves;
  const toneContrast = params.toneContrast;
  const grainScale = params.grainScale;
  const speckle = params.speckle;
  const veins = params.veins;
  const stain = params.stain;
  const crackStrength = params.crackStrength;
  const edgeWear = params.edgeWear;
  const snow = params.snow;
  const wash = params.topWash;
  const washOpacity = params.topOpacity;
  const streaks = params.streaks;
  const patinaStrength = params.patina;
  const undulation = params.undulation;
  const undulationScale = 1 / params.undulationSize;
  const glint = params.glint;
  const glintScale = params.glintScale;
  const laminae = params.laminae;
  const laminaeTint = params.laminaeTint;
  const vesicleDepth = params.vesicleDepth;
  const baseRoughness = params.roughness;
  const lateralRadius = (field.extents[0] + field.extents[2]) / 2;
  const radius = (field.extents[0] + field.extents[1] + field.extents[2]) / 3;
  const height = field.extents[1] * 2;
  const dripStep = radius * 0.04;
  const seed = field.seed;
  const bf = field.frame;
  const vf = field.veinFrame;

  for (let y = 0; y < chartPx; y++) {
    for (let x = 0; x < chartPx; x++) {
      const i = y * chartPx + x;
      const px = surface.points[i * 3];
      const py = surface.points[i * 3 + 1];
      const pz = surface.points[i * 3 + 2];
      normalOf(_n, surface, chartPx, x, y);
      const up = _n[1];
      const crease = curvatureOf(surface, atlas, x, y, reaches[0]);
      const hollow = curvatureOf(surface, atlas, x, y, reaches[2]);

      // Edge wear: where the surface is convex at any scale, from a slab's
      // edge to the ridge between two scoops, rain and frost have taken the
      // skin off. The mask is read at three reaches so a rounded ridge
      // counts as much as a sharp crease, and broken up so it is patchy. It
      // bleaches the stone below and keeps the stain, the patina and the
      // lichen off, which is what an edge that sheds water looks like.
      // Summed rather than taken at the strongest, and weighted toward the
      // wide reaches, so the wear feathers out from a ridge over a hand's
      // width instead of drawing a line along it.
      const convex = clamp01(
        smoothstep(0.1, 0.8, crease) * 0.2 +
          smoothstep(0.05, 0.5, curvatureOf(surface, atlas, x, y, reaches[1])) * 0.3 +
          smoothstep(0.02, 0.3, curvatureOf(surface, atlas, x, y, reaches[3])) * 0.4 +
          smoothstep(0.01, 0.18, curvatureOf(surface, atlas, x, y, reaches[4])) * 0.4
      );
      const wearNoise = fbm3r(px * WEAR_SCALE, py * WEAR_SCALE, pz * WEAR_SCALE, 3, seed ^ 0x77a2c3d1);
      const wear = edgeWear * convex * convex * smoothstep(0.2, 0.75, wearNoise + 0.1);
      const sheltered = 1 - wear * 0.85;

      // Tone: a slow octave stack ramped dark to light through the mid tint,
      // the cloudy mottling every rock has under its detail. Each slab of the
      // pile shifts it by its own value, so no two plates are one grey, and
      // the pile's bevels go into the height for the normal map to find.
      let tone = toneOf(fbm3r(px * toneScale, py * toneScale, pz * toneScale, toneOctaves, seed ^ 0x7f4a7c15), toneOctaves, toneContrast);
      let slab = 0.5;
      if (field.plates) {
        platesInto(_plate, field.plates, px, py, pz);
        tone = clamp01(tone + (_plate.id - 0.5) * params.plateTint);
        slab = _plate.height;
      }

      // Bedding, at both of its scales. A package is a group of beds that
      // weathers as one, and it carries the broad light and dark banding; the
      // beds inside it are the laminations. Both land on the tone and not on
      // the finished colour, which is what puts every layer below — grain,
      // veins, cracks, staining, the whole weathering pass — on top of a
      // banded base rather than over it.
      let bed = 0;
      if (laminae > 0 && field.laminae && field.packages) {
        laminaInto(_package, field.packages, px, py, pz);
        laminaInto(_lamina, field.laminae, px, py, pz);
        bed = laminae;
        const banding = (_package.id - 0.5) * 0.7 + (_lamina.id - 0.5) * 0.5;
        tone = clamp01(tone + banding * laminaeTint * bed);
      }

      let r = ramp(palette.dark[0], palette.mid[0], palette.light[0], tone);
      let g = ramp(palette.dark[1], palette.mid[1], palette.light[1], tone);
      let b = ramp(palette.dark[2], palette.mid[2], palette.light[2], tone);
      let roughness = baseRoughness + (tone - 0.5) * 0.1;
      let metallic = params.metallic;
      let ao = 1;
      let relief = 0.5 + (tone - 0.5) * 0.2 + (slab - 0.5) * 0.25 * field.plateShare;

      // The rest of the bed: the odd band that is not the stone's colour at
      // all, the seam where two beds meet, and the ribbing. The ribbing goes
      // in whatever the mesh took, because a bed too thin for a quad is
      // exactly the one the height map has to carry.
      if (bed > 0) {
        if (_lamina.accent > 0) {
          // Not every pale band is as pale as the next, and one that replaces
          // the stone whole reads as paint.
          const take = _lamina.accent * bed * (0.45 + 0.4 * fract(_lamina.id * 53.17));
          r = mix(r, palette.lamina[0], take);
          g = mix(g, palette.lamina[1], take);
          b = mix(b, palette.lamina[2], take);
        }
        // A bedding plane is a seam, not a groove: it darkens and roughens,
        // and it cuts a hairline into the height. The package's own seam is
        // the deeper one, because that is where a face steps.
        const seam = clamp01(_lamina.parting * 0.7 + _package.parting) * bed;
        const dim = 1 - seam * 0.35;
        r *= dim;
        g *= dim;
        b *= dim;
        roughness += 0.12 * seam;
        // The whole stack goes into the height, however little of it the mesh
        // could take. The packages rib it and the beds ripple across them.
        relief += (_package.hardness * 0.6 + _lamina.hardness * 0.35) * bed - seam * 0.12;
        // A soft bed is a weathered bed, and a weathered face is a rough one.
        roughness += (0.25 - _package.hardness * 0.5) * bed * 0.2;
      }
      // The surface before any fine layer moves it. A shard is flattened back
      // to this, and tone and slabs are slow enough that it is one level
      // across a shard.
      const baseRelief = relief;

      // Grain: the rock as a mosaic of crystals. Each cell of a fine cellular
      // field is one mineral, and each sits at its own height with a soft
      // grain boundary, which is what puts the mineral-scale facets into the
      // normal map. Three minerals, in granite's proportions.
      if (speckle > 0) {
        const grain = worley3Into(_worley, px * grainScale, py * grainScale, pz * grainScale, seed ^ 0x2b9f7e3d);
        const id = grain.id;
        const boundary = smoothstep(0, 0.3, grain.f2 - grain.f1);
        let mineral: Rgb;
        let mineralRough: number;
        if (id < 0.11) {
          mineral = palette.biotite;
          mineralRough = 0.5;
        } else if (id < 0.5) {
          mineral = palette.quartz;
          mineralRough = 0.62;
        } else {
          mineral = palette.feldspar;
          mineralRough = 0.8;
        }
        const amount = speckle * (0.4 + 0.4 * boundary);
        const crystal = (0.9 + 0.2 * fract(id * 17.31)) * (0.9 + 0.1 * boundary);
        r = mix(r, mineral[0], amount) * crystal;
        g = mix(g, mineral[1], amount) * crystal;
        b = mix(b, mineral[2], amount) * crystal;
        roughness = mix(roughness, mineralRough, speckle * 0.6);
        relief += speckle * (fract(id * 53.17) - 0.5) * 0.07 * boundary;
      }

      // The wash: the stone that looks up, multiplied by one tint. Part of
      // the base colour, before the glint, the veins, the stain and the
      // growth, so none of them take it, and drifted at its margin like the
      // snow so the line is never a contour.
      if (wash > 0) {
        const drift = (fbm3r(px * WASH_SCALE, py * WASH_SCALE, pz * WASH_SCALE, 2, seed ^ 0x77617368) - 0.5) * 0.4;
        const cover = smoothstep(0.7 - 0.6 * wash, 1.0 - 0.45 * wash, up + drift) * washOpacity;
        if (cover > 0) {
          r *= mix(1, palette.wash[0], cover);
          g *= mix(1, palette.wash[1], cover);
          b *= mix(1, palette.wash[2], cover);
        }
      }

      // Glint: shards of mica or pyrite grown in the stone — metallic,
      // glossy, pale, each an angular crystal set into the surface. Its
      // colour and its finish are painted here; its height is not, because
      // the layers below still have the stone's own roughness to add and a
      // crystal face has none of it. The flattening is after them.
      let shard = 0;
      if (glint > 0) {
        flakeAt(_flake, px, py, pz, glintScale, glint * GLINT_SHARE, seed ^ 0x676c6e74);
        shard = _flake.cover;
        if (shard > 0) {
          const bright = 0.75 + 0.5 * fract(_flake.id * 3.13);
          r = mix(r, palette.glint[0] * bright, shard);
          g = mix(g, palette.glint[1] * bright, shard);
          b = mix(b, palette.glint[2] * bright, shard);
          metallic = mix(metallic, 1, shard);
          roughness = mix(roughness, 0.18 + 0.12 * fract(_flake.id * 5.37), shard);
          ao *= 1 - 0.25 * shard;
        }
      }

      // Grit: texel-scale roughness, the one layer that makes a surface read
      // as rough rather than as smooth plastic with a picture on it.
      const grit = fbm3r(px * GRIT_SCALE, py * GRIT_SCALE, pz * GRIT_SCALE, 3, seed ^ 0x4d2a1f3b);
      const bare = 1 - shard;
      relief += (grit - 0.5) * 0.14;
      roughness += (grit - 0.5) * 0.2 * bare;
      const gritLight = 1 + (grit - 0.5) * 0.3 * bare;
      r *= gritLight;
      g *= gritLight;
      b *= gritLight;

      // Undulation: the soft, irregular unevenness of a weathered face —
      // the slow waviness between what the mesh carries and the grain. It is
      // a shape and not a mark, so it writes the height alone and leaves the
      // colour and the finish to the layers that have a reason to move them.
      if (undulation > 0) {
        const wave = fbm3r(px * undulationScale, py * undulationScale, pz * undulationScale, UNDULATION_OCTAVES, seed ^ 0x756e6576);
        relief += ((wave - 0.5) / UNDULATION_SPREAD) * undulation * 0.12;
      }

      // A crystal face is flat and sits below the stone around it. The grain,
      // the grit and the undulation belong to the rock, so inside a shard the
      // height is the stone's own slow level, sunk by the depth it is set at.
      if (shard > 0) relief = mix(relief, baseRelief - GLINT_INSET, shard);

      // Veins: the zero crossings of a stretched, warped octave sum are thin
      // lines that wander across the rock in one direction and branch. Quartz
      // is lighter, harder and glassier than what it runs through.
      if (veins > 0) {
        const gate = smoothstep(0.62 - 0.3 * veins, 0.68 - 0.22 * veins, fbm3r(px * 0.8, py * 0.8, pz * 0.8, 2, seed ^ 0x3779b97f));
        if (gate > 0) {
          const vx = (vf[0] * px + vf[1] * py + vf[2] * pz) * VEIN_STRETCH;
          const vy = vf[3] * px + vf[4] * py + vf[5] * pz;
          const vz = vf[6] * px + vf[7] * py + vf[8] * pz;
          const wobble = (fbm3r(vx * 1.5, vy * 1.5, vz * 1.5, 2, seed ^ 0x5f3759df) - 0.5) * 0.2;
          const f = fbm3r((vx + wobble) * VEIN_SCALE, vy * VEIN_SCALE, vz * VEIN_SCALE, 2, seed ^ 0x61c88647);
          const line = 1 - smoothstep(0, 0.07, Math.abs((f - 0.5) / 0.2));
          const vein = line * gate * (0.6 + 0.8 * grit);
          r = mix(r, palette.vein[0], vein * 0.4);
          g = mix(g, palette.vein[1], vein * 0.4);
          b = mix(b, palette.vein[2], vein * 0.4);
          relief += vein * 0.025;
          roughness -= vein * 0.12;
        }
      }

      // Cracks: a sharp dark core with a faint shoulder, a lighter chipped rim
      // beside it, and the fine octave as hairlines. `crackStrength` scales
      // the drawing; the grooves in the mesh are the same coarse field.
      crackCoarse(_crack, field, px, py, pz);
      const w = params.crackWidth * _crack.width;
      const edge = _crack.edge;
      const presence = _crack.presence;
      let crack = 0;
      if (crackStrength > 0 && field.cracks > 0) {
        const shoulder = (1 - smoothstep(0, w, edge)) * presence;
        const core = (1 - smoothstep(0, w * 0.35, edge)) * presence;
        crack = mix(shoulder * 0.45, 1, core) * crackStrength;
        const fine = crackFine(field, px, py, pz, params.crackWidth * 0.5) * crackStrength * 0.5;
        crack = Math.max(crack, fine);
        const rim = (smoothstep(w * 0.7, w * 1.3, edge) - smoothstep(w * 1.3, w * 2.6, edge)) * presence * crackStrength * 0.14;
        const shade = (1 - 0.85 * crack) * (1 + rim);
        r *= shade;
        g *= shade;
        b *= shade;
        relief -= crack * params.crackDepth * 0.5;
        relief += rim * 0.15;
        ao *= 1 - 0.6 * crack;
        roughness += 0.15 * crack;

        // Foliation: faint hairlines running with the bedding in bands, the
        // grain of the stone itself rather than a break in it.
        if (field.bedding > 0) {
          const bx = bf[0] * px + bf[1] * py + bf[2] * pz;
          const by = bf[3] * px + bf[4] * py + bf[5] * pz;
          const bz = bf[6] * px + bf[7] * py + bf[8] * pz;
          const f = fbm3r(bx * FOLIATION_ALONG, by * FOLIATION_ACROSS, bz * FOLIATION_ALONG, 2, seed ^ 0x7c1d2e3f);
          const line = 1 - smoothstep(0, 0.1, Math.abs((f - 0.5) / 0.2));
          const band = smoothstep(0.5, 0.62, fbm3r(bx * 1.5, by * 4, bz * 1.5, 2, seed ^ 0x1e4b5c6d));
          const foliation = line * band * field.bedding * crackStrength * 0.35;
          const dim = 1 - foliation;
          r *= dim;
          g *= dim;
          b *= dim;
          relief -= foliation * 0.08;
        }
      }

      // Vesicles: gas holes. An open hole is a bowl lined with dark glass,
      // rough and in its own shadow, and deepest where the bubble was widest.
      // The height map takes the pits the mesh could not, so a pin prick
      // still has a floor. A filled hole is an amygdale: a pale mineral spot,
      // flush with the stone, with a thin dark lining at its edge.
      let hole = 0;
      if (surface.holes) {
        const cover = surface.holes[i * 4];
        if (cover > 0) {
          const pit = surface.holes[i * 4 + 1];
          const scale = surface.holes[i * 4 + 2];
          const filled = surface.holes[i * 4 + 3];
          if (filled > 0) {
            const lining = cover * (1 - smoothstep(0.35, 0.8, cover));
            const fill = smoothstep(0.5, 1, cover);
            const shade = 0.9 + 0.2 * grit;
            r = mix(r, palette.amygdale[0] * shade, fill) * (1 - 0.5 * lining);
            g = mix(g, palette.amygdale[1] * shade, fill) * (1 - 0.5 * lining);
            b = mix(b, palette.amygdale[2] * shade, fill) * (1 - 0.5 * lining);
            roughness = mix(roughness, 0.55, fill);
            relief = mix(relief, baseRelief + 0.01, fill);
          } else {
            hole = cover;
            // The floor falls away from the lip, so the wall is lit and the
            // bottom is not.
            const floor = smoothstep(0, 0.7, pit);
            const shade = 1 - 0.35 * floor;
            r = mix(r, palette.holeFloor[0], cover * (0.35 + 0.5 * floor)) * shade;
            g = mix(g, palette.holeFloor[1], cover * (0.35 + 0.5 * floor)) * shade;
            b = mix(b, palette.holeFloor[2], cover * (0.35 + 0.5 * floor)) * shade;
            relief -= cover * pit * vesicleDepth * (0.25 + 0.35 * scale);
            ao *= 1 - cover * (0.35 + 0.45 * floor);
            roughness += 0.1 * cover;
          }
        }
      }

      // Stain: iron seeping from the cracks and lying in bands along the
      // bedding, as a tint that keeps the grain under it.
      if (stain > 0) {
        const bx = bf[0] * px + bf[1] * py + bf[2] * pz;
        const by = (bf[3] * px + bf[4] * py + bf[5] * pz) * STAIN_BANDING;
        const bz = bf[6] * px + bf[7] * py + bf[8] * pz;
        const patch = smoothstep(0.56, 0.68, fbm3r(bx * STAIN_SCALE, by * STAIN_SCALE, bz * STAIN_SCALE, 3, seed ^ 0x1b873593));
        const seep =
          field.cracks > 0
            ? (1 - smoothstep(0, w * 4.5, edge)) * presence * smoothstep(0.46, 0.58, fbm3r(px * 1.3, py * 1.3, pz * 1.3, 2, seed ^ 0x2c1b3c6d))
            : 0;
        const s = clamp01(stain * (patch * 0.75 + seep * 0.9)) * (0.75 + 0.5 * grit) * sheltered;
        const sr = mix(r * palette.rustTint[0], palette.rust[0], 0.35) * 0.9;
        const sg = mix(g * palette.rustTint[1], palette.rust[1], 0.35) * 0.9;
        const sb = mix(b * palette.rustTint[2], palette.rust[2], 0.35) * 0.9;
        r = mix(r, sr, s * 0.85);
        g = mix(g, sg, s * 0.85);
        b = mix(b, sb, s * 0.85);
        roughness += 0.08 * s;
      }

      // The bleaching itself, and the dirt a hollow holds.
      const dirt = weathering * Math.max(smoothstep(0.15, 0.6, -crease), smoothstep(0.1, 0.5, -hollow) * 0.7, hole * 0.5);
      r = mix(r, palette.edge[0], wear * 0.6) * (1 + 0.08 * wear);
      g = mix(g, palette.edge[1], wear * 0.6) * (1 + 0.08 * wear);
      b = mix(b, palette.edge[2], wear * 0.6) * (1 + 0.08 * wear);
      roughness -= 0.15 * wear;
      r = mix(r, palette.soil[0], dirt * 0.5);
      g = mix(g, palette.soil[1], dirt * 0.5);
      b = mix(b, palette.soil[2], dirt * 0.5);
      roughness += 0.1 * dirt;
      ao *= 1 - 0.25 * dirt;

      // Run-off: droplet trails down the sides, full at the head and shed
      // as they fall, gathering into the cracks. Measured here, so the crust
      // below can grow under the drip lines, and painted later, so it lies
      // over the lichen the way a drip does.
      let film = 0;
      if (streaks > 0) {
        const lateral = Math.hypot(px, pz);
        // Off the underside, where a drop lets go, and off the top's centre,
        // where every angle around the axis meets.
        const holds = smoothstep(-0.6, -0.2, up) * smoothstep(0.08, 0.25, lateral / lateralRadius);
        if (holds > 0) {
          const steep = 1 - smoothstep(0.45, 0.8, up);
          streakAt(_run, sources, field, Math.atan2(pz, px), py, lateral, steep);
          if (_run.film > 0) {
            // Whole at the head, and broken into rivulets as it thins.
            const rivulets = mix(1, 0.45 + 0.9 * fbm3r(px * RIVULET_AROUND, py * RIVULET_DOWN, pz * RIVULET_AROUND, 2, seed ^ 0x72697675), smoothstep(0, 0.5, _run.t));
            film = clamp01(streaks * _run.film * holds * rivulets * (1 + 0.6 * crack));
          }
        }
      }

      const exposure = 0.35 + 0.65 * smoothstep(-0.2, 0.7, up);
      const colony = smoothstep(0.38, 0.62, fbm3r(px * COLONY_SCALE, py * COLONY_SCALE, pz * COLONY_SCALE, 2, seed ^ 0x3f84d5b5));

      // Patina: the dark crust of oxides and algae that old stone grows
      // wherever water sits or runs. It is read off the things that hold
      // moisture — the faces that look up, the hollows, the seep beside a
      // crack, the drip lines and the lichen colonies — and starved on the
      // edges that shed it. Its boundary is cut by a fine noise so it reads
      // as a skin with a margin, not a shadow, and the margin is thinner and
      // browner than the heart.
      let patina = 0;
      if (patinaStrength > 0) {
        const seep = field.cracks > 0 ? (1 - smoothstep(0, w * 5, edge)) * presence : 0;
        const moisture =
          clamp01(
            0.3 * smoothstep(0.3, 0.9, up) +
              0.5 * smoothstep(0.05, 0.4, -hollow) +
              0.45 * colony +
              0.5 * seep +
              0.6 * film
          ) *
          sheltered *
          (1 - convex * 0.6) *
          smoothstep(-0.7, -0.3, up);
        const growth = fbm3r(px * PATINA_SCALE, py * PATINA_SCALE, pz * PATINA_SCALE, 3, seed ^ 0x68e31da4);
        const skin = (fbm3r(px * PATINA_EDGE, py * PATINA_EDGE, pz * PATINA_EDGE, 2, seed ^ 0x5041544e) - 0.5) * 0.14 + (grit - 0.5) * 0.1;
        const threshold = 0.66 - 0.36 * moisture * patinaStrength;
        const crust = smoothstep(threshold, threshold + 0.07, growth + skin);
        patina = crust * (0.6 + 0.4 * moisture) * patinaStrength;
        if (patina > 0) {
          // Thin at the margin, dark at the heart.
          const heart = smoothstep(threshold + 0.05, threshold + 0.18, growth + skin);
          const cr = mix(palette.patinaThin[0], palette.patina[0], heart) * (0.85 + 0.3 * grit);
          const cg = mix(palette.patinaThin[1], palette.patina[1], heart) * (0.85 + 0.3 * grit);
          const cb = mix(palette.patinaThin[2], palette.patina[2], heart) * (0.85 + 0.3 * grit);
          r = mix(r, cr, patina * 0.85);
          g = mix(g, cg, patina * 0.85);
          b = mix(b, cb, patina * 0.85);
          // A varnish is a little glossier than the raw stone; an algal crust is not.
          roughness = mix(roughness, 0.68 + 0.2 * (1 - heart), patina * 0.6);
          metallic *= 1 - patina * 0.6;
          ao *= 1 - 0.1 * patina;
        }
      }

      // Lichen: crustose discs, one at most per cell of a cellular field, each
      // its own size, colour and ragged edge, cracked into areolae with a pale
      // margin and a darker heart, and standing a little proud of the stone.
      // Mostly on the faces that look up, thinning down the sides.
      if (weathering > 0) {
        const cover = weathering * exposure * colony * (1.2 + 0.4 * patina) * sheltered;
        const cell = worley3Into(_worley, px * LICHEN_CELLS, py * LICHEN_CELLS, pz * LICHEN_CELLS, seed ^ 0x6a09e667);
        if (cell.id < cover) {
          const kind = fract(cell.id * 37.71);
          const discRadius = (0.2 + 0.36 * fract(cell.id * 91.3)) * (kind < 0.08 ? 0.55 : 1);
          const ragged = (fbm3r(px * 70, py * 70, pz * 70, 2, seed ^ 0x51ed270b) - 0.5) * 0.3;
          const f = cell.f1 + ragged;
          const disc = (1 - smoothstep(discRadius - 0.06, discRadius + 0.02, f)) * (1 - crack * 0.8) * (1 - hole * 0.9);
          if (disc > 0) {
            const tint: Rgb = kind < 0.08 ? palette.lichenYellow : kind < 0.4 ? palette.lichenGrey : palette.lichen;
            const areolae = worley3Into(_worley, px * AREOLA_CELLS, py * AREOLA_CELLS, pz * AREOLA_CELLS, seed ^ 0x2545f491);
            const areola = 1 - smoothstep(0, 0.14, areolae.f2 - areolae.f1);
            const margin = smoothstep(discRadius - 0.2, discRadius - 0.04, f);
            const heart = (1 - smoothstep(0, discRadius * 0.6, f)) * 0.3;
            const shade = (1 - 0.25 * areola) * (1 + 0.2 * margin) * (0.92 + 0.16 * grit);
            const lr = mix(tint[0], palette.lichenHeart[0], heart) * shade;
            const lg = mix(tint[1], palette.lichenHeart[1], heart) * shade;
            const lb = mix(tint[2], palette.lichenHeart[2], heart) * shade;
            r = mix(r, lr, disc * 0.95);
            g = mix(g, lg, disc * 0.95);
            b = mix(b, lb, disc * 0.95);
            relief += disc * (0.04 - 0.03 * areola);
            roughness = mix(roughness, 0.92, disc);
            metallic *= 1 - disc;
            ao *= 1 - 0.15 * areola * disc;
          }
        }
      }

      // Drip stains: darker below a crack on a side face, from a short march
      // up the same crack field.
      if (weathering > 0 && field.cracks > 0 && crackStrength > 0 && up > -0.3 && up < 0.7) {
        let above = 0;
        for (let step = 1; step <= DRIP_STEPS; step++) {
          crackCoarse(_crack, field, px, py + step * dripStep, pz);
          const line = (1 - smoothstep(0, 0.08 * _crack.width, _crack.edge)) * _crack.presence;
          above = Math.max(above, line * (1 - step / (DRIP_STEPS + 1)));
        }
        const drip = weathering * above * crackStrength * 0.3;
        r *= 1 - drip;
        g *= 1 - drip;
        b *= 1 - drip;
        roughness += 0.1 * drip;
      }

      // Ground contact: soil climbs the lowest part.
      const contact = weathering * smoothstep(0.25, 0, (py - field.base) / height);
      r = mix(r, palette.soil[0], contact * 0.6);
      g = mix(g, palette.soil[1], contact * 0.6);
      b = mix(b, palette.soil[2], contact * 0.6);
      roughness += 0.12 * contact;

      // The run-off itself, over the lichen. Colour and finish only, never
      // height: it is a film on the stone and not the stone.
      if (film > 0) {
        r = mix(r, palette.streak[0], film);
        g = mix(g, palette.streak[1], film);
        b = mix(b, palette.streak[2], film);
        roughness += 0.12 * film;
        metallic *= 1 - film;
        ao *= 1 - 0.25 * film * (1 - palette.streakLum);
      }

      // Snow: settles on what faces up, deeper in the hollows, blown off the
      // edges, and drifted at its margin so the line is never a contour.
      if (snow > 0) {
        const settle = smoothstep(0.7 - 0.6 * snow, 1.0 - 0.45 * snow, up);
        const drift = (fbm3r(px * SNOW_SCALE, py * SNOW_SCALE, pz * SNOW_SCALE, 3, seed ^ 0x536e6f77) - 0.5) * 0.6;
        const cover = smoothstep(0.25, 0.6, settle + drift + smoothstep(0, 0.4, -hollow) * 0.25 - convex * 0.45 - crack * 0.5 - hole * 0.3);
        if (cover > 0) {
          // Snow is not one white: it is mottled where it has lain and
          // melted, blue in its own shadow, lumpy where it drifted, and thin
          // at its margin, where the stone shows through.
          const mottle = fbm3r(px * SNOW_MOTTLE, py * SNOW_MOTTLE, pz * SNOW_MOTTLE, 3, seed ^ 0x4d6f7474);
          const lumps = fbm3r(px * SNOW_LUMPS, py * SNOW_LUMPS, pz * SNOW_LUMPS, 2, seed ^ 0x4c756d70);
          const shade = 0.82 + 0.22 * mottle + (grit - 0.5) * 0.1;
          const shadow = smoothstep(0, 0.4, -hollow) * 0.5 + (1 - smoothstep(0.3, 0.8, lumps)) * 0.3;
          const sr = mix(palette.snow[0], palette.snowShadow[0], shadow) * shade;
          const sg = mix(palette.snow[1], palette.snowShadow[1], shadow) * shade;
          const sb = mix(palette.snow[2], palette.snowShadow[2], shadow) * shade;
          const thin = cover * (0.75 + 0.25 * smoothstep(0.4, 1, cover));
          r = mix(r, sr, thin);
          g = mix(g, sg, thin);
          b = mix(b, sb, thin);
          relief = mix(relief, 0.55 + (lumps - 0.5) * 0.3 + (grit - 0.5) * 0.06, cover);
          roughness = mix(roughness, 0.78 + 0.12 * mottle, cover);
          metallic *= 1 - cover;
          ao = mix(ao, 1, cover);
        }
      }

      const texel = (origin[1] + y) * stride + origin[0] + x;
      canvas.albedo[texel * 3] = clamp01(r);
      canvas.albedo[texel * 3 + 1] = clamp01(g);
      canvas.albedo[texel * 3 + 2] = clamp01(b);
      canvas.alpha[texel] = 1;
      canvas.relief[texel] = clamp01(relief);
      canvas.ao[texel] = clamp01(ao);
      canvas.roughness[texel] = clamp01(roughness);
      canvas.metallic[texel] = clamp01(metallic);
    }
  }
}

/** One stone painted into its block of an image already made. */
export function paintStone(canvas: Canvas, params: Params, field: RockField, atlas: ChartAtlas, block: number): void {
  const palette = paletteOf(params);
  const sources = params.streaks > 0 ? streakSources(field, params.streakCount, field.extents[1] * 2) : new Float32Array(0);

  for (let faceIndex = 0; faceIndex < FACES.length; faceIndex++)
    paintChart(canvas, params, field, palette, sources, atlas, block, faceIndex);
}

/** The stone image as float channels: six charts in a 3x2 image. */
export function buildStoneCanvas(params: Params, field: RockField): Canvas {
  const atlas = rockAtlas(params);
  const canvas = createCanvas(atlas.width, atlas.height, params.bumpStrength * params.bump);
  paintStone(canvas, params, field, atlas, 0);
  return canvas;
}

export function buildRockCanvases(params: Params, field: RockField): Canvases {
  return { stone: buildStoneCanvas(params, field) };
}

/**
 * The cluster's image: one block of six charts per pebble, each painted from
 * that pebble's own field. Nothing is shared between two pebbles, so a mark
 * read off `up` or off the surface's own curvature lands on the stone that
 * carries it.
 */
export function buildPebbleCanvases(params: Params, cluster: Cluster): Canvases {
  const { atlas } = cluster;
  const canvas = createCanvas(atlas.width, atlas.height, params.bumpStrength * params.bump);

  cluster.pebbles.forEach((pebble, block) => paintStone(canvas, params, pebble.field, atlas, block));

  return { stone: canvas };
}
