import { toFloat16 } from '../../utils/float16';

// Where the ocean's shore waves run: a grid around the camera holding, per
// texel, the seconds a wave takes to get there from deep water. Waves set out
// from water SOURCE_DEPTH deep, move at the shallow-water speed √(g·h) and
// cannot cross land: an eikonal solve by fast sweeping. The wavefronts are the
// crests, so they turn toward the shallows, wrap around headlands and islands,
// and fill bays. Water deep water cannot reach, such as a lagoon behind a
// bar, gets none.
//
// The grid is aligned to the world, so rebuilding it in a new place leaves the
// times where both grids see the same water.

/** Texels per side. */
export const SHORE_FIELD_TEXELS = 256;
/** Metres per texel. */
export const SHORE_FIELD_TEXEL = 8;
export const SHORE_FIELD_SPAN = SHORE_FIELD_TEXELS * SHORE_FIELD_TEXEL;
/** Metres of water from which waves set out; water.wgsl fades them in from
 *  here. */
export const SHORE_SOURCE_DEPTH = 24;

const GRAVITY = 9.81;
// Shallowest water the wave speed is taken over, so it stays finite at the
// waterline.
const MIN_DEPTH = 0.1;
// Passes of the four sweep orders. Two settle every path that turns at most
// once, which covers bays and islands.
const SWEEPS = 2;
// Metres a second the times carry on at past the water the waves reach: a
// wave's speed in a metre of water.
const EXTEND_SPEED = Math.sqrt(GRAVITY * 1);
// Metres the camera moves from the centre before the grid follows it; the
// centre snaps to this.
const RECENTRE = 128;
// Seconds between rebuilds for newly loaded or edited ground.
const REFRESH = 1;
// Rows of ground sampled per frame while rebuilding.
const ROWS_PER_FRAME = 32;
// Share of the half span over which the waves fade out toward the grid's
// edge: paths from deep water outside it are missing, so the times there are
// least sure.
const EDGE_FADE_START = 0.55;
const EDGE_FADE_END = 0.85;

// Rebuild stages after sampling, one a frame.
const SAMPLING = 0;
const SOLVED = 1;
const EXTENDED = 2;

/** Texel counts from the last solve, for the console. */
export interface ShoreFieldStats {
  water: number;
  sources: number;
  reached: number;
  /** Seconds: the longest trip from deep water. */
  longest: number;
}

/** Metres of ocean at world (x, z): 0 on land, in lakes or on unknown ground. */
export type OceanDepthSampler = (x: number, z: number) => number;

// Fast sweeping: settles `times` toward the arrival time of a front that
// takes `costs[i]` seconds to cross texel i. A texel costing 0 keeps its time.
function sweep(times: Float32Array, costs: Float32Array, size: number): void {
  for (let pass = 0; pass < SWEEPS; pass++)
    for (let order = 0; order < 4; order++) {
      const flipX = (order & 1) !== 0;
      const flipY = (order & 2) !== 0;
      for (let row = 0; row < size; row++) {
        const y = flipY ? size - 1 - row : row;
        for (let col = 0; col < size; col++) {
          const x = flipX ? size - 1 - col : col;
          const i = x + y * size;
          const f = costs[i];
          if (f <= 0) continue;
          const a = Math.min(
            x > 0 ? times[i - 1] : Infinity,
            x < size - 1 ? times[i + 1] : Infinity
          );
          const b = Math.min(
            y > 0 ? times[i - size] : Infinity,
            y < size - 1 ? times[i + size] : Infinity
          );
          if (a === Infinity && b === Infinity) continue;
          const diff = a - b;
          const t =
            Math.abs(diff) >= f
              ? Math.min(a, b) + f
              : (a + b + Math.sqrt(2 * f * f - diff * diff)) * 0.5;
          if (t < times[i]) times[i] = t;
        }
      }
    }
}

/**
 * Seconds a wave takes from water `sourceDepth` deep to each of the `size`²
 * texels of `depth`, `texel` metres apart. Infinity where it cannot reach.
 * `costs` is scratch of the same size.
 */
export function solveArrival(
  depth: Float32Array,
  size: number,
  texel: number,
  sourceDepth: number,
  out: Float32Array,
  costs = new Float32Array(size * size)
): void {
  for (let i = 0; i < size * size; i++) {
    const d = depth[i];
    const source = d >= sourceDepth;
    out[i] = source ? 0 : Infinity;
    costs[i] =
      source || d <= 0
        ? 0
        : texel / Math.sqrt(GRAVITY * Math.max(d, MIN_DEPTH));
  }
  sweep(out, costs, size);
}

/**
 * Marks in `reached` the texels of `times` the waves reach, then carries the
 * times on across the rest at EXTEND_SPEED, so the field has no step where the
 * waves stop: a lagoon or lake beside the sea shows no crowded phase at its
 * edge. Every texel is left finite unless none was reached.
 */
export function extendArrival(
  times: Float32Array,
  size: number,
  texel: number,
  reached: Uint8Array,
  costs = new Float32Array(size * size)
): void {
  const f = texel / EXTEND_SPEED;
  for (let i = 0; i < size * size; i++) {
    reached[i] = times[i] !== Infinity ? 1 : 0;
    costs[i] = reached[i] ? 0 : f;
  }
  sweep(times, costs, size);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// d/d(axis) of `times` at texel i along `step` (1 or size): central inside
// the grid, one-sided at its edge.
function slope(
  times: Float32Array,
  i: number,
  onLow: boolean,
  onHigh: boolean,
  step: number,
  texel: number
): number {
  if (onLow && onHigh) return (times[i + step] - times[i - step]) / (2 * texel);
  if (onHigh) return (times[i + step] - times[i]) / texel;
  if (onLow) return (times[i] - times[i - step]) / texel;
  return 0;
}

/**
 * Packs extended `times` into f16 texels of (seconds from deep water, its
 * world x and z gradient, strength). Texel x runs along world +x and y along
 * +z. Strength is 0 where the waves do not reach and fades toward the grid's
 * edge.
 */
export function packShoreField(
  times: Float32Array,
  reached: Uint8Array,
  size: number,
  texel: number,
  out: Uint16Array
): void {
  const zero = toFloat16(0);
  out.fill(zero);
  const half = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = x + y * size;
      if (times[i] === Infinity) continue;
      const edge =
        Math.max(Math.abs(x + 0.5 - half), Math.abs(y + 0.5 - half)) / half;
      const strength = reached[i]
        ? 1 - smoothstep(EDGE_FADE_START, EDGE_FADE_END, edge)
        : 0;
      out[i * 4] = toFloat16(times[i]);
      out[i * 4 + 1] = toFloat16(
        slope(times, i, x > 0, x < size - 1, 1, texel)
      );
      out[i * 4 + 2] = toFloat16(
        slope(times, i, y > 0, y < size - 1, size, texel)
      );
      out[i * 4 + 3] = toFloat16(strength);
    }
}

/**
 * The shore field on the GPU. It is rebuilt around the camera when the camera
 * strays RECENTRE metres from its centre, and every REFRESH seconds after
 * `invalidate` as ground loads or is edited. A rebuild samples the ground over
 * several frames, then solves, extends, and packs and uploads, a frame each.
 */
export class ShoreField {
  readonly texture: GPUTexture;
  /** World xz of the grid's centre. */
  centreX = 0;
  centreZ = 0;
  readonly stats: ShoreFieldStats = { water: 0, sources: 0, reached: 0, longest: 0 };

  private depth = new Float32Array(SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS);
  private times = new Float32Array(SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS);
  private costs = new Float32Array(SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS);
  private reached = new Uint8Array(SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS);
  private packed = new Uint16Array(SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS * 4);
  private buildX = 0;
  private buildZ = 0;
  // Next row to sample, or -1 when no rebuild is under way.
  private row = -1;
  // After the rows are sampled: SOLVED, then EXTENDED, then uploaded, one
  // step a frame.
  private stage = SAMPLING;
  private built = false;
  private dirty = true;
  private age = Infinity;

  constructor(device: GPUDevice) {
    this.texture = device.createTexture({
      label: 'shore field',
      size: [SHORE_FIELD_TEXELS, SHORE_FIELD_TEXELS],
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
  }

  /** The ground changed: rebuild once REFRESH has passed. */
  invalidate(): void {
    this.dirty = true;
  }

  update(
    device: GPUDevice,
    deltaSeconds: number,
    eyeX: number,
    eyeZ: number,
    sample: OceanDepthSampler
  ): void {
    this.age += deltaSeconds;
    if (this.row < 0) {
      const strayed =
        Math.max(
          Math.abs(eyeX - this.centreX),
          Math.abs(eyeZ - this.centreZ)
        ) > RECENTRE;
      const stale = this.dirty && this.age >= REFRESH;
      if (this.built && !strayed && !stale) return;
      this.buildX = Math.round(eyeX / RECENTRE) * RECENTRE;
      this.buildZ = Math.round(eyeZ / RECENTRE) * RECENTRE;
      this.row = 0;
      this.dirty = false;
      this.age = 0;
    }

    const size = SHORE_FIELD_TEXELS;
    const texel = SHORE_FIELD_TEXEL;
    const originX = this.buildX - SHORE_FIELD_SPAN / 2 + texel / 2;
    const originZ = this.buildZ - SHORE_FIELD_SPAN / 2 + texel / 2;
    if (this.stage === SOLVED) {
      extendArrival(this.times, size, texel, this.reached, this.costs);
      this.stage = EXTENDED;
      return;
    }
    if (this.stage === EXTENDED) {
      packShoreField(this.times, this.reached, size, texel, this.packed);
      device.queue.writeTexture(
        { texture: this.texture },
        this.packed as BufferSource,
        { bytesPerRow: size * 8 },
        { width: size, height: size }
      );
      this.centreX = this.buildX;
      this.centreZ = this.buildZ;
      this.built = true;
      this.stage = SAMPLING;
      this.row = -1;
      return;
    }

    const end = Math.min(size, this.row + ROWS_PER_FRAME);
    for (let y = this.row; y < end; y++)
      for (let x = 0; x < size; x++)
        this.depth[x + y * size] = sample(originX + x * texel, originZ + y * texel);
    this.row = end;
    if (this.row < size) return;

    solveArrival(
      this.depth,
      size,
      texel,
      SHORE_SOURCE_DEPTH,
      this.times,
      this.costs
    );
    this.stage = SOLVED;
    const stats = this.stats;
    stats.water = stats.sources = stats.reached = stats.longest = 0;
    for (let i = 0; i < size * size; i++) {
      if (this.depth[i] > 0) stats.water++;
      if (this.depth[i] >= SHORE_SOURCE_DEPTH) stats.sources++;
      const t = this.times[i];
      if (t !== Infinity) {
        stats.reached++;
        if (t > stats.longest) stats.longest = t;
      }
    }
  }

  dispose(): void {
    this.texture.destroy();
  }
}
