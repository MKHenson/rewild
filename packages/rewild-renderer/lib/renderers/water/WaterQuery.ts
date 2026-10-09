import { MAX_WATER_TYPES } from '../terrain/Water';
import { WaterMap } from '../terrain/WaterMap';
import { fromFloat16 } from '../../utils/float16';

// The water at a point for gameplay: the water map read as the water shader
// reads it, and the height of the drawn waves from the GPU probe (WaterProbe).
// The map part is exact and immediate. The waves arrive a few frames late.

/** Points the probe follows at once. */
export const PROBE_POINTS = 32;
/** Floats per point in the probe's input: ProbePoint in water-probe.wgsl. */
export const PROBE_POINT_FLOATS = 12;
/** Floats per point in the probe's results. */
export const PROBE_RESULT_FLOATS = 4;

/** Body id where there is no water map. */
export const NO_BODY = -1;

export interface WaterQuerySample {
  /** Whether water stands here: covered, over ground below the level. */
  wet: boolean;
  /** World height of the surface at rest; -Infinity with no water map. */
  level: number;
  /** World height of the ground, at full resolution. */
  ground: number;
  /** Metres from the ground up to the level; 0 when dry. */
  depth: number;
  /** Metres of water under the level by the water map's own heights: the
   *  depth that holds the waves. */
  mapDepth: number;
  /** 0..1. */
  coverage: number;
  /** Weights over the water palette, summing to 1. */
  typeWeights: Float64Array;
  /** The body that owns the nearest texel; NO_BODY with no water map. */
  bodyId: number;
  /** Flow direction, -1..1 per axis. Zero is still water. */
  flowX: number;
  flowZ: number;
  /** Metres the waves and the swash lift the surface above the level, from
   *  the probe; 0 until it reports. */
  waveHeight: number;
  /** World height of the surface now: level + waveHeight. */
  surface: number;
}

export function createWaterQuerySample(): WaterQuerySample {
  return {
    wet: false,
    level: -Infinity,
    ground: 0,
    depth: 0,
    mapDepth: 0,
    coverage: 0,
    typeWeights: new Float64Array(MAX_WATER_TYPES),
    bodyId: NO_BODY,
    flowX: 0,
    flowZ: 0,
    waveHeight: 0,
    surface: -Infinity,
  };
}

function setDry(out: WaterQuerySample, ground: number) {
  out.wet = false;
  out.level = -Infinity;
  out.ground = ground;
  out.depth = 0;
  out.mapDepth = 0;
  out.coverage = 0;
  out.typeWeights.fill(0);
  out.bodyId = NO_BODY;
  out.flowX = 0;
  out.flowZ = 0;
  out.waveHeight = 0;
  out.surface = -Infinity;
}

/**
 * Reads `water` at texel coordinates (`fx`, `fy`) as the water shader does:
 * level, its heights, coverage, type weights and flow filtered bilinearly, the
 * weights then normalised, and the body from the nearest texel. Fills every
 * field of `out` but ground, depth, wet, waveHeight and surface.
 */
export function sampleWaterMap(
  water: WaterMap,
  fx: number,
  fy: number,
  out: WaterQuerySample
): void {
  const size = water.size;
  const last = size - 1;
  const x = Math.min(last, Math.max(0, fx));
  const y = Math.min(last, Math.max(0, fy));
  const x0 = Math.min(Math.floor(x), Math.max(last - 1, 0));
  const y0 = Math.min(Math.floor(y), Math.max(last - 1, 0));
  const x1 = Math.min(x0 + 1, last);
  const y1 = Math.min(y0 + 1, last);
  const tx = x - x0;
  const ty = y - y0;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  const t00 = x0 + y0 * size;
  const t10 = x1 + y0 * size;
  const t01 = x0 + y1 * size;
  const t11 = x1 + y1 * size;

  const { level, heights, coverage, typeWeights, flow } = water;
  const relLevel =
    fromFloat16(level[t00]) * w00 +
    fromFloat16(level[t10]) * w10 +
    fromFloat16(level[t01]) * w01 +
    fromFloat16(level[t11]) * w11;
  const relHeight =
    fromFloat16(heights[t00]) * w00 +
    fromFloat16(heights[t10]) * w10 +
    fromFloat16(heights[t01]) * w01 +
    fromFloat16(heights[t11]) * w11;
  out.level = water.baseLevel + relLevel;
  out.mapDepth = Math.max(relLevel - relHeight, 0);
  out.coverage =
    (coverage[t00] * w00 +
      coverage[t10] * w10 +
      coverage[t01] * w01 +
      coverage[t11] * w11) /
    255;

  let total = 0;
  for (let c = 0; c < MAX_WATER_TYPES; c++) {
    const weight =
      (typeWeights[t00 * 4 + c] * w00 +
        typeWeights[t10 * 4 + c] * w10 +
        typeWeights[t01 * 4 + c] * w01 +
        typeWeights[t11 * 4 + c] * w11) /
      255;
    out.typeWeights[c] = weight;
    total += weight;
  }
  if (total > 1e-4)
    for (let c = 0; c < MAX_WATER_TYPES; c++) out.typeWeights[c] /= total;
  else {
    out.typeWeights.fill(0);
    out.typeWeights[0] = 1;
  }

  out.flowX =
    (flow[t00 * 2] * w00 +
      flow[t10 * 2] * w10 +
      flow[t01 * 2] * w01 +
      flow[t11 * 2] * w11) /
    127;
  out.flowZ =
    (flow[t00 * 2 + 1] * w00 +
      flow[t10 * 2 + 1] * w10 +
      flow[t01 * 2 + 1] * w01 +
      flow[t11 * 2 + 1] * w11) /
    127;
  out.bodyId = water.bodyIds[Math.round(x) + Math.round(y) * size];
}

/** What the query reads the terrain through. */
export interface WaterQuerySource {
  /** World metres a chunk spans; 0 before the terrain starts. */
  readonly chunkSize: number;
  /** Ground height at world (x, z); null where it is not loaded. */
  sampleHeight(x: number, z: number): number | null;
  /** The water map of chunk (cx, cy); null where it has none. */
  waterMapAt(cx: number, cy: number): WaterMap | null;
}

export class WaterQuery {
  // Per probe: a generation, bumped each time it is taken (0 while free), so
  // a result in flight for its last owner is not handed to the next.
  private generation = new Uint32Array(PROBE_POINTS);
  private nextGeneration = 1;
  private requested = new Uint8Array(PROBE_POINTS);
  private atRest = new Uint8Array(PROBE_POINTS);
  private known = new Uint8Array(PROBE_POINTS);
  private height = new Float64Array(PROBE_POINTS);
  private worldX = new Float64Array(PROBE_POINTS);
  private worldZ = new Float64Array(PROBE_POINTS);
  private depth = new Float64Array(PROBE_POINTS);
  private level = new Float64Array(PROBE_POINTS);
  private weights = new Float64Array(PROBE_POINTS * MAX_WATER_TYPES);

  constructor(private source: WaterQuerySource) {}

  /** Takes a probe to read the waves with; -1 when every probe is taken.
   *  An `atRest` probe reads the water that rests at its point, wherever the
   *  waves move it, as a vertex of the drawn grid does; otherwise it reads
   *  the water now over the point. */
  acquireProbe(atRest = false): number {
    for (let i = 0; i < PROBE_POINTS; i++)
      if (this.generation[i] === 0) {
        this.generation[i] = this.nextGeneration++;
        if (this.nextGeneration > 0xffffffff) this.nextGeneration = 1;
        this.known[i] = 0;
        this.requested[i] = 0;
        this.atRest[i] = atRest ? 1 : 0;
        return i;
      }
    return -1;
  }

  releaseProbe(probe: number): void {
    if (probe < 0 || probe >= PROBE_POINTS) return;
    this.generation[probe] = 0;
    this.known[probe] = 0;
    this.requested[probe] = 0;
  }

  /**
   * The water at world (x, z) into `out`. With a `probe` from acquireProbe,
   * the probe reads the waves there next frame, and `out` takes the height
   * it last reported, a few frames old. Sample with the same probe each frame
   * to follow a moving point. False, and `out` dry, where the ground is not
   * loaded.
   */
  sample(x: number, z: number, out: WaterQuerySample, probe = -1): boolean {
    const span = this.source.chunkSize;
    const ground = span ? this.source.sampleHeight(x, z) : null;
    if (ground === null) {
      setDry(out, 0);
      return false;
    }
    const cx = Math.round(x / span);
    const cy = Math.round(z / span);
    const water = this.source.waterMapAt(cx, cy);
    if (!water) {
      setDry(out, ground);
      return true;
    }

    const texels = water.size - 1;
    sampleWaterMap(
      water,
      ((x - cx * span) / span + 0.5) * texels,
      ((cy * span - z) / span + 0.5) * texels,
      out
    );
    out.ground = ground;
    out.depth = Math.max(out.level - ground, 0);
    out.wet = out.coverage > 0 && out.depth > 0;
    out.waveHeight = 0;

    if (probe >= 0 && probe < PROBE_POINTS && this.generation[probe] !== 0) {
      if (out.coverage > 0) {
        this.requested[probe] = 1;
        this.worldX[probe] = x;
        this.worldZ[probe] = z;
        this.depth[probe] = out.mapDepth;
        this.level[probe] = out.level;
        for (let c = 0; c < MAX_WATER_TYPES; c++)
          this.weights[probe * MAX_WATER_TYPES + c] = out.typeWeights[c];
        if (this.known[probe]) out.waveHeight = this.height[probe];
      } else {
        this.requested[probe] = 0;
        this.known[probe] = 0;
      }
    }
    out.surface = out.level + out.waveHeight;
    return true;
  }

  /**
   * Writes the points probes asked for since the last call into `points`
   * (ProbePoint in water-probe.wgsl), measured from the waves' origin, and
   * each one's generation into `generations`: 0 for a probe that asked for
   * nothing. False when none asked.
   */
  stage(
    originX: number,
    originZ: number,
    points: Float32Array,
    generations: Uint32Array
  ): boolean {
    let any = false;
    for (let i = 0; i < PROBE_POINTS; i++) {
      const o = i * PROBE_POINT_FLOATS;
      if (!this.requested[i] || this.generation[i] === 0) {
        generations[i] = 0;
        points.fill(0, o, o + PROBE_POINT_FLOATS);
        continue;
      }
      any = true;
      this.requested[i] = 0;
      generations[i] = this.generation[i];
      points[o] = this.worldX[i] - originX;
      points[o + 1] = this.worldZ[i] - originZ;
      points[o + 2] = this.depth[i];
      points[o + 3] = this.level[i];
      for (let c = 0; c < MAX_WATER_TYPES; c++)
        points[o + 4 + c] = this.weights[i * MAX_WATER_TYPES + c];
      points[o + 8] = this.atRest[i];
      points.fill(0, o + 9, o + PROBE_POINT_FLOATS);
    }
    return any;
  }

  /** Takes the probe's `results` for points staged with `generations`. */
  receive(results: Float32Array, generations: Uint32Array): void {
    for (let i = 0; i < PROBE_POINTS; i++) {
      const generation = generations[i];
      if (generation === 0 || generation !== this.generation[i]) continue;
      this.height[i] = results[i * PROBE_RESULT_FLOATS];
      this.known[i] = 1;
    }
  }
}
