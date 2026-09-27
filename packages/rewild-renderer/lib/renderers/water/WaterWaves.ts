import { hash01, mixHash } from 'rewild-common';
import { MAX_WATER_TYPES, WaterType } from '../terrain/Water';

// The waves every water surface shares: a heightfield summed from octaves of
// `exp(sin θ − 1)`, which has the sharp crests and broad troughs of wind waves.
// Each octave also drags the point the next one samples along its own slope,
// so crests bunch, bend and break up the way independent waves never do.
//
// Octave i at world xz p has phase θ = k·(D·p) − ω·t + φ, adds A·(e − MEAN) to
// the height where e = exp(sin θ − 1), and moves p by −D·drag·A·e·cos θ before
// the next octave. Octaves run longest first, so the long ones shape where the
// short ones fall and never the other way round.
//
// Bearings are fixed and spread over every direction, so open water is chop
// with no prevailing heading. The wind sets how high and choppy it is.
//
// One set of lengths and bearings is used everywhere; a palette type only sets
// each octave's amplitude and the drag, so a blend between types blends those
// and the surface never tears. The CPU owns the set and uploads it, and
// `height` sums the same octaves the vertex shader does.

export const GRAVITY = 9.81;
const TWO_PI = Math.PI * 2;

/** Seconds the wave clock runs before it wraps. Every frequency is a whole
 *  number of cycles over it, so the wrap is seamless and f32 keeps its
 *  precision however long the game runs. */
export const WAVE_LOOP_SECONDS = 256;

/** Octaves in the set. */
export const WAVE_COUNT = 40;

/** How much faster the wave clock runs in full wind than in a calm. The
 *  clock only accumulates, so a change of rate never jumps the surface. */
export const WIND_TIME_SPEEDUP = 0.6;

/** Mean of exp(sin θ − 1) over a cycle, I0(1)/e. Subtracted so the surface
 *  averages to the water level. */
export const WAVE_MEAN = 0.4657596075936404;

// Metres: the set spans this range, log-spaced from longest to shortest (about
// ×1.19 a step) and jittered so no two octaves keep a simple ratio. The short
// end only shades, and gives a lake's short peak a chop spectrum under it.
const LONGEST = 120;
const SHORTEST = 0.15;
// Successive bearings step by the golden angle, so neighbouring octaves never
// run close to parallel, and are jittered by up to this many degrees.
const GOLDEN_ANGLE = 137.50776405;
const BEARING_JITTER = 20;
const LAYOUT_SEED = 0x5eed;

// Each octave's length, bearing and starting phase, fixed for the game so the
// CPU and GPU sums always agree.
const WAVELENGTHS: number[] = [];
const BEARINGS: number[] = [];
const PHASES: number[] = [];
for (let i = 0; i < WAVE_COUNT; i++) {
  const t = (i + 0.5 * (hash01(LAYOUT_SEED, i * 3) - 0.5)) / (WAVE_COUNT - 1);
  const clamped = Math.min(1, Math.max(0, t));
  WAVELENGTHS.push(LONGEST * Math.pow(SHORTEST / LONGEST, clamped));
  const jitter = (hash01(LAYOUT_SEED, i * 3 + 1) * 2 - 1) * BEARING_JITTER;
  BEARINGS.push(((i * GOLDEN_ANGLE + jitter) * Math.PI) / 180);
  PHASES.push(hash01(LAYOUT_SEED, i * 3 + 2) * Math.PI * 2);
}

/** Sum of k·A over the set at full wind and a wave response of 1, before the
 *  ripple taper: about 0.25 an octave below the peak, which is what makes the
 *  chop read. The surface is a heightfield, so steepness sharpens crests but
 *  can never fold them over. */
export const WAVE_STEEPNESS = 10;

// The spectrum peaks at a type's waveScale in full wind and at this share of it
// in a breeze: a stronger wind raises longer, faster waves.
export const CALM_PEAK = 0.35;
// Log-space width of the spectrum above its peak, where swell falls away fast.
const SPECTRUM_WIDTH = 0.45;
// How fast steepness falls away below the peak. Zero keeps every shorter
// octave as steep as the peak, as a wind sea does: the fast short chop then
// carries the look, not just the slow swell.
const CHOP_FALLOFF = 0;
// Extra steepness in a bump around the peak, in log wavelength, so the swell
// stands taller than the chop riding on it. Kept low and broad: a few octaves
// carrying most of the slope cross into a regular lattice.
const PEAK_BOOST = 0.5;
const PEAK_WIDTH = 0.5;
/** Share of the full-wind height and drag that still water keeps, so a lake on
 *  a calm day still moves. */
export const CALM_RESPONSE = 0.15;
// Drag at full wind: how hard each octave pulls the next along its slope.
// Zero adds octaves independently; more bunches and breaks up the crests.
const WAVE_DRAG = 0.7;

// Large-scale variation, so no two stretches of water look alike: the swell
// and the chop each get a field of two value-noise octaves, and an octave's
// amplitude takes a blend of the two by its length. One stretch is then long
// rolling swell and the next short chop, and the chop field reaches down to
// glassy slicks. Both drift downwind so rough patches cross the water.
export const SWELL_FIELD = 0;
export const CHOP_FIELD = 1;
// Metres per cell: swell octave a, b, then chop octave a, b.
export const VARIATION_SCALES = [760, 280, 430, 150];
const VARIATION_WEIGHTS = [0.65, 0.35];
// Noise between these maps across the full range, so both ends show.
const VARIATION_CONTRAST_LOW = 0.3;
const VARIATION_CONTRAST_HIGH = 0.7;
export const VARIATION_RANGES = [
  [0.35, 1.35],
  [0.08, 1.45],
];
const VARIATION_DRIFT = 2.5; // metres a second at full wind
const VARIATION_SEED = 0x7a1e;
// The noise lattice repeats every this many cells, so the drift can wrap.
export const VARIATION_PERIOD = 256;

// Foam rides downwind at this many metres a second at full wind. Its drift
// wraps at a whole number of every foam texture tile in water.wgsl.
const FOAM_DRIFT = 1.5;
export const FOAM_DRIFT_PERIOD = 8192;

const LOG_K_LONGEST = Math.log(TWO_PI / LONGEST);
const LOG_K_SPAN = Math.log(LONGEST / SHORTEST);

/** How far an octave of wavenumber `k` takes the chop field over the swell's:
 *  0 for the longest octave, 1 for the shortest. */
export function octaveBand(k: number): number {
  return Math.min(1, Math.max(0, (Math.log(k) - LOG_K_LONGEST) / LOG_K_SPAN));
}

// The shader takes octave phases from an origin near the camera, snapped to
// this many metres, so its sin and cos see small arguments: far from the world
// origin a short octave's phase runs to hundreds of thousands of radians, and
// GPU trig breaks up into blocks there.
const ORIGIN_SNAP = 1024;

export interface Wave {
  dirX: number;
  dirZ: number;
  /** Wavenumber, 2π / wavelength. */
  k: number;
  /** Angular frequency, snapped to whole cycles over WAVE_LOOP_SECONDS. */
  omega: number;
  phase: number;
}

/** ω for wavenumber k in deep water, snapped so the wave loops. */
export function loopingOmega(k: number): number {
  const cycles = Math.max(
    1,
    Math.round((Math.sqrt(GRAVITY * k) * WAVE_LOOP_SECONDS) / (Math.PI * 2))
  );
  return (cycles * Math.PI * 2) / WAVE_LOOP_SECONDS;
}

/**
 * Each octave's share of a type's steepness, summing to 1: level for chop
 * below `peak` metres, a bump at the peak, and falling fast for longer swell.
 */
// Octaves far below the peak lose steepness as (wavelength / peak) to this
// power. Applied after the spectrum is normalised, so the taken slope is not
// handed to the peak: many steep, sharp-crested ripples crossing at fixed
// angles emboss the surface into cells.
const RIPPLE_TAPER = 0.25;

/** Share of its spectrum steepness an octave of `wavelength` metres keeps
 *  under a peak of `peak` metres. */
export function rippleTaper(wavelength: number, peak: number): number {
  return wavelength >= peak ? 1 : Math.pow(wavelength / peak, RIPPLE_TAPER);
}

export function waveSpectrum(peak: number, out: Float64Array): void {
  let total = 0;
  for (let i = 0; i < WAVE_COUNT; i++) {
    const ratio = WAVELENGTHS[i] / peak;
    if (ratio >= 1) {
      const x = Math.log(ratio) / SPECTRUM_WIDTH;
      out[i] = Math.exp(-0.5 * x * x);
    } else out[i] = Math.pow(ratio, CHOP_FALLOFF);
    const bump = Math.log(ratio) / PEAK_WIDTH;
    out[i] += PEAK_BOOST * Math.exp(-0.5 * bump * bump);
    total += out[i];
  }
  for (let i = 0; i < WAVE_COUNT; i++) out[i] /= total;
}

function latticeValue(ix: number, iy: number): number {
  let h = Math.imul(ix & (VARIATION_PERIOD - 1), 0x9e3779b1);
  h = Math.imul(h ^ (iy & (VARIATION_PERIOD - 1)), 0x85ebca6b);
  return mixHash(h) / 4294967296;
}

// Smoothly interpolated lattice noise in 0..1. water.wgsl's valueNoise is the
// same function.
function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = latticeValue(ix, iy);
  const b = latticeValue(ix + 1, iy);
  const c = latticeValue(ix, iy + 1);
  const d = latticeValue(ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

// A grid of `spacing` metres holds an octave from RESOLVE_TO spacings up and
// loses it by RESOLVE_FROM; shorter octaves only shade. Fewer samples a
// wavelength leave jagged facets that, at a grazing view, hide one another in
// grid-aligned bands. water.wgsl's
// geometryWaves fades them the same way.
const RESOLVE_FROM = 4;
const RESOLVE_TO = 8;

/** How much of an octave of `wavelength` metres a grid of `spacing` can hold. */
export function gridResolve(wavelength: number, spacing: number): number {
  const t =
    (wavelength - RESOLVE_FROM * spacing) /
    ((RESOLVE_TO - RESOLVE_FROM) * spacing);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

// Floats in the packed uniform, matching water.wgsl's Waves struct: six
// vec4 of state, two of LOD distances, two of LOD spacings and one of grid.
const VARIATION_OFFSET = 12;
const WIND_OFFSET = 20;
const LOD_DISTANCE_OFFSET = 24;
const LOD_SPACING_OFFSET = 32;
const GRID_OFFSET = 40;
const HEADER_FLOATS = 44;
const WAVE_OFFSET = HEADER_FLOATS;
const AMP_OFFSET = WAVE_OFFSET + WAVE_COUNT * 4;
const PHASE_OFFSET = AMP_OFFSET + WAVE_COUNT * 4;
export const WAVE_UNIFORM_FLOATS = PHASE_OFFSET + WAVE_COUNT;

/**
 * The wind-driven wave state: amplitudes and drag follow the wind as it is,
 * and the variation noise drifts with it.
 */
export class WaterWaves {
  /** Seconds on the looping wave clock. */
  time = 0;
  /** Per octave, its shape; amplitudes are in `amplitudes`. */
  readonly waves: Wave[] = [];
  /** Per octave and palette type, metres: `amplitudes[i * 4 + type]`. */
  readonly amplitudes = new Float64Array(WAVE_COUNT * MAX_WATER_TYPES);
  /** Per palette type, the drag at the current wind. */
  readonly drag = new Float64Array(MAX_WATER_TYPES);
  /** Per variation octave, its drift in lattice cells (x, z), wrapped. Starts
   *  seeded, so no two octaves sample the same stretch of lattice. */
  readonly variationOffset = new Float64Array(VARIATION_SCALES.length * 2);
  /** Metres the foam has drifted (x, z), wrapped at FOAM_DRIFT_PERIOD. */
  readonly foamOffset = new Float64Array(2);
  /** World xz the packed phases are taken from. */
  originX = 0;
  originZ = 0;

  private spectrum = new Float64Array(WAVE_COUNT);

  constructor() {
    for (let o = 0; o < this.variationOffset.length; o++)
      this.variationOffset[o] = hash01(VARIATION_SEED, o) * VARIATION_PERIOD;
    for (let i = 0; i < WAVE_COUNT; i++) {
      const k = (Math.PI * 2) / WAVELENGTHS[i];
      this.waves.push({
        dirX: Math.cos(BEARINGS[i]),
        dirZ: Math.sin(BEARINGS[i]),
        k,
        omega: loopingOmega(k),
        phase: PHASES[i],
      });
    }
  }

  /**
   * Advances the waves by `deltaSeconds` under the wind: `windX`, `windZ` the
   * direction the air moves, `windiness` 0..1.
   */
  update(
    deltaSeconds: number,
    windX: number,
    windZ: number,
    windiness: number,
    palette: readonly WaterType[]
  ): void {
    const wind = Math.min(1, Math.max(0, windiness));
    const rate = 1 + WIND_TIME_SPEEDUP * wind;
    this.time = (this.time + deltaSeconds * rate) % WAVE_LOOP_SECONDS;

    const length = Math.hypot(windX, windZ);
    const wx = length > 0 ? windX / length : 1;
    const wz = length > 0 ? windZ / length : 0;
    const response = CALM_RESPONSE + (1 - CALM_RESPONSE) * wind;

    for (let v = 0; v < VARIATION_SCALES.length; v++) {
      const cells =
        (VARIATION_DRIFT * wind * deltaSeconds) / VARIATION_SCALES[v];
      for (let axis = 0; axis < 2; axis++) {
        const o = v * 2 + axis;
        const moved = this.variationOffset[o] - (axis === 0 ? wx : wz) * cells;
        this.variationOffset[o] =
          moved - Math.floor(moved / VARIATION_PERIOD) * VARIATION_PERIOD;
      }
    }

    for (let axis = 0; axis < 2; axis++) {
      const moved =
        this.foamOffset[axis] +
        (axis === 0 ? wx : wz) * FOAM_DRIFT * wind * deltaSeconds;
      this.foamOffset[axis] =
        moved - Math.floor(moved / FOAM_DRIFT_PERIOD) * FOAM_DRIFT_PERIOD;
    }

    for (let t = 0; t < MAX_WATER_TYPES; t++) {
      const type = palette[t];
      this.drag[t] = type ? WAVE_DRAG * response : 0;
      const peak = type
        ? type.waveScale * (CALM_PEAK + (1 - CALM_PEAK) * wind)
        : 1;
      if (type) waveSpectrum(peak, this.spectrum);
      for (let i = 0; i < WAVE_COUNT; i++)
        this.amplitudes[i * MAX_WATER_TYPES + t] = type
          ? (WAVE_STEEPNESS *
              type.waveResponse *
              response *
              this.spectrum[i] *
              rippleTaper(WAVELENGTHS[i], peak)) /
            this.waves[i].k
          : 0;
    }
  }

  /** Moves the phase origin to the snapped cell around world (x, z). */
  setOrigin(x: number, z: number): void {
    this.originX = Math.round(x / ORIGIN_SNAP) * ORIGIN_SNAP;
    this.originZ = Math.round(z / ORIGIN_SNAP) * ORIGIN_SNAP;
  }

  /** A variation field (SWELL_FIELD or CHOP_FIELD) at world (x, z): the scale
   *  on the octaves it governs. */
  variation(x: number, z: number, field: number): number {
    let n = 0;
    for (let o = 0; o < 2; o++) {
      const v = field * 2 + o;
      n +=
        VARIATION_WEIGHTS[o] *
        valueNoise(
          x / VARIATION_SCALES[v] + this.variationOffset[v * 2],
          z / VARIATION_SCALES[v] + this.variationOffset[v * 2 + 1]
        );
    }
    let t =
      (n - VARIATION_CONTRAST_LOW) /
      (VARIATION_CONTRAST_HIGH - VARIATION_CONTRAST_LOW);
    t = Math.min(1, Math.max(0, t));
    t = t * t * (3 - 2 * t);
    const [low, high] = VARIATION_RANGES[field];
    return low + (high - low) * t;
  }

  /**
   * The surface's height above its level at world (x, z): what the vertex
   * shader displaces a grid of `spacing` metres by, for water whose type
   * weights are `types` (MAX_WATER_TYPES long, summing to 1). `gain` scales
   * every octave, as the shader's shore and distance fades do.
   */
  height(
    x: number,
    z: number,
    types: ArrayLike<number>,
    spacing: number,
    gain = 1
  ): number {
    const swell = this.variation(x, z, SWELL_FIELD) * gain;
    const chop = this.variation(x, z, CHOP_FIELD) * gain;
    let drag = 0;
    for (let t = 0; t < MAX_WATER_TYPES; t++) drag += this.drag[t] * types[t];
    let px = x;
    let pz = z;
    let height = 0;
    for (let i = 0; i < WAVE_COUNT; i++) {
      const wave = this.waves[i];
      const resolved = gridResolve((Math.PI * 2) / wave.k, spacing);
      if (resolved <= 0) break;
      let amplitude = 0;
      for (let t = 0; t < MAX_WATER_TYPES; t++)
        amplitude += this.amplitudes[i * MAX_WATER_TYPES + t] * types[t];
      amplitude *= (swell + (chop - swell) * octaveBand(wave.k)) * resolved;
      const theta =
        wave.k * (wave.dirX * px + wave.dirZ * pz) -
        wave.omega * this.time +
        wave.phase;
      const e = Math.exp(Math.sin(theta) - 1);
      height += amplitude * (e - WAVE_MEAN);
      const pull = drag * amplitude * e * Math.cos(theta);
      px -= wave.dirX * pull;
      pz -= wave.dirZ * pull;
    }
    return height;
  }

  /**
   * Writes the Waves uniform: the clock, the normal fade scale, the viewer's
   * xz from the phase origin, the phase origin, per-type drag, the variation
   * drift and the foliage wind (direction xz, strength, clock), whose gust
   * field ruffles the ripples; the LOD bands (see waterGridBands) and finest
   * grid spacing, from which the shader picks the waves each vertex may be
   * displaced by, and the foam drift; then per octave (dirX, dirZ, k, ω), per octave each palette
   * type's amplitude, and the phases at the origin.
   */
  pack(
    normalFade: number,
    eyeX: number,
    eyeZ: number,
    finestSpacing: number,
    lodDistances: ArrayLike<number>,
    lodSpacings: ArrayLike<number>,
    wind: ArrayLike<number>,
    out: Float32Array
  ): void {
    out[0] = this.time;
    out[1] = normalFade;
    out[2] = eyeX - this.originX;
    out[3] = eyeZ - this.originZ;
    out[4] = this.originX;
    out[5] = this.originZ;
    out[6] = 0;
    out[7] = 0;
    for (let t = 0; t < MAX_WATER_TYPES; t++) out[8 + t] = this.drag[t];
    for (let o = 0; o < this.variationOffset.length; o++)
      out[VARIATION_OFFSET + o] = this.variationOffset[o];
    for (let i = 0; i < 4; i++) out[WIND_OFFSET + i] = wind[i];
    for (let i = 0; i < 8; i++) {
      out[LOD_DISTANCE_OFFSET + i] = lodDistances[i] ?? 0;
      out[LOD_SPACING_OFFSET + i] = lodSpacings[i] ?? 0;
    }
    out[GRID_OFFSET] = finestSpacing;
    out[GRID_OFFSET + 1] = this.foamOffset[0];
    out[GRID_OFFSET + 2] = this.foamOffset[1];
    out[GRID_OFFSET + 3] = 0;
    for (let i = 0; i < WAVE_COUNT; i++) {
      const wave = this.waves[i];
      const w = WAVE_OFFSET + i * 4;
      out[w] = wave.dirX;
      out[w + 1] = wave.dirZ;
      out[w + 2] = wave.k;
      out[w + 3] = wave.omega;
      for (let t = 0; t < MAX_WATER_TYPES; t++)
        out[AMP_OFFSET + i * 4 + t] = this.amplitudes[i * MAX_WATER_TYPES + t];
      // The phase at the origin, reduced in double precision, so the shader
      // measures positions from the origin and adds only small numbers.
      const phase =
        wave.phase +
        wave.k * (wave.dirX * this.originX + wave.dirZ * this.originZ);
      out[PHASE_OFFSET + i] = phase - Math.floor(phase / TWO_PI) * TWO_PI;
    }
  }
}

/**
 * The shared GPU copy of the waves, written once a frame and bound by every
 * chunk's water pass.
 */
export class WaterWaveBuffer {
  readonly waves = new WaterWaves();
  private data = new Float32Array(WAVE_UNIFORM_FLOATS);
  private gpu: GPUBuffer | null = null;

  buffer(device: GPUDevice): GPUBuffer {
    if (!this.gpu)
      this.gpu = device.createBuffer({
        label: 'water waves',
        size: WAVE_UNIFORM_FLOATS * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    return this.gpu;
  }

  upload(
    device: GPUDevice,
    normalFade: number,
    eyeX: number,
    eyeZ: number,
    finestSpacing: number,
    lodDistances: ArrayLike<number>,
    lodSpacings: ArrayLike<number>,
    wind: ArrayLike<number>
  ): void {
    this.waves.pack(
      normalFade,
      eyeX,
      eyeZ,
      finestSpacing,
      lodDistances,
      lodSpacings,
      wind,
      this.data
    );
    device.queue.writeBuffer(this.buffer(device), 0, this.data);
  }

  dispose(): void {
    this.gpu?.destroy();
    this.gpu = null;
  }
}
