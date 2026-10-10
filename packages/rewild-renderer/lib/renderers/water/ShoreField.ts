import { toFloat16 } from '../../utils/float16';

// Where the ocean's shore waves run: a grid around the camera holding, per
// texel, the seconds a wave takes to get there from deep water. Waves set out
// from water SOURCE_DEPTH deep, move at the shallow-water speed √(g·h) and
// cannot cross land: an eikonal solve by fast sweeping. A grid that holds no
// water that deep starts them from its deepest water instead, which lies out
// to sea: a wide shelf can keep deep water past the grid's edge. Water that
// joins the open sea only outside the grid, such as a bay behind a headland
// past its edge, gets them from where it meets that edge. The wavefronts are the
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
// Metres above the grid's deepest water that still start waves when the grid
// holds none SOURCE_DEPTH deep, so they set out along a band, not a point.
const SOURCE_BAND = 2;
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
/** Texels the swash field carries the waves onto land past the last water
 *  they reach. */
export const SWASH_REACH_TEXELS = 3;

// Rebuild stages after sampling, one a frame.
const SAMPLING = 0;
const SOLVED = 1;
const EXTENDED = 2;

/** Texel counts from the last solve, for the console. */
export interface ShoreFieldStats {
  water: number;
  sources: number;
  reached: number;
  /** Metres of water the waves set out from. */
  sourceDepth: number;
  /** Seconds: the longest trip from deep water. */
  longest: number;
}

/** A point on the waterline the waves reach (ShoreField.nearestShore). */
export interface ShorePoint {
  x: number;
  z: number;
  /** Metres from the point asked about. */
  distance: number;
  /** 0..1: the waves' strength there, fading toward the grid's edge. */
  strength: number;
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
 * Without water that deep, the waves set out from water within SOURCE_BAND of
 * the deepest. Water they cannot reach that touches the grid's edge starts
 * them there too. `costs` is scratch of the same size. Returns the depth they
 * set out from, or 0 when the grid holds no water deeper than SOURCE_BAND.
 */
export function solveArrival(
  depth: Float32Array,
  size: number,
  texel: number,
  sourceDepth: number,
  out: Float32Array,
  costs = new Float32Array(size * size)
): number {
  let deepest = 0;
  for (let i = 0; i < size * size; i++) deepest = Math.max(deepest, depth[i]);
  const from = Math.min(sourceDepth, deepest - SOURCE_BAND);
  for (let i = 0; i < size * size; i++) {
    const d = depth[i];
    const source = from > 0 && d >= from;
    out[i] = source ? 0 : Infinity;
    costs[i] =
      source || d <= 0
        ? 0
        : texel / Math.sqrt(GRAVITY * Math.max(d, MIN_DEPTH));
  }
  sweep(out, costs, size);

  let open = false;
  for (let k = 0; k < size; k++)
    for (const i of [k, k + (size - 1) * size, k * size, size - 1 + k * size])
      if (depth[i] > 0 && out[i] === Infinity) {
        out[i] = 0;
        costs[i] = 0;
        open = true;
      }
  if (open) sweep(out, costs, size);
  return Math.max(0, from);
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
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = x + y * size;
      if (times[i] === Infinity) continue;
      const strength = reached[i] ? edgeStrength(x, y, size) : 0;
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

// The waves' strength at a reached texel: 1, fading toward the grid's edge.
function edgeStrength(x: number, y: number, size: number): number {
  const half = size / 2;
  const edge =
    Math.max(Math.abs(x + 0.5 - half), Math.abs(y + 0.5 - half)) / half;
  return 1 - smoothstep(EDGE_FADE_START, EDGE_FADE_END, edge);
}

/**
 * Writes the waterline the waves reach: each reached texel of water with land
 * beside it, as world x and z and its strength, into `xs`, `zs` and
 * `strengths`. Texel (0, 0) is centred on world (`originX`, `originZ`).
 * Returns how many it wrote.
 */
export function collectShore(
  depth: Float32Array,
  reached: Uint8Array,
  size: number,
  texel: number,
  originX: number,
  originZ: number,
  xs: Float32Array,
  zs: Float32Array,
  strengths: Float32Array
): number {
  let count = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = x + y * size;
      if (!reached[i] || depth[i] <= 0) continue;
      const shore =
        (x > 0 && depth[i - 1] <= 0) ||
        (x < size - 1 && depth[i + 1] <= 0) ||
        (y > 0 && depth[i - size] <= 0) ||
        (y < size - 1 && depth[i + size] <= 0);
      if (!shore) continue;
      xs[count] = originX + x * texel;
      zs[count] = originZ + y * texel;
      strengths[count] = edgeStrength(x, y, size);
      count++;
    }
  return count;
}

/**
 * Packs the swash field into f16 texels of (seconds a wave takes to get to the
 * nearest water it reaches, its strength there). Reached texels keep their
 * own. Ground up to SWASH_REACH_TEXELS from them takes the nearest one's, so
 * the swash up a beach keeps time with the crests at its waterline. Water the
 * waves do not reach (`depth` > 0) gets none. `steps` and `sources` are
 * scratch, one per texel.
 */
export function packSwashField(
  times: Float32Array,
  reached: Uint8Array,
  depth: Float32Array,
  size: number,
  out: Uint16Array,
  steps: Int8Array,
  sources: Int32Array
): void {
  const texels = size * size;
  for (let i = 0; i < texels; i++) {
    steps[i] = reached[i] ? 0 : -1;
    sources[i] = reached[i] ? i : -1;
  }
  for (let ring = 1; ring <= SWASH_REACH_TEXELS; ring++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = x + y * size;
        if (steps[i] !== -1 || depth[i] > 0) continue;
        for (let dy = -1; dy <= 1 && steps[i] === -1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            const n = nx + ny * size;
            if (steps[n] !== ring - 1) continue;
            steps[i] = ring;
            sources[i] = sources[n];
            break;
          }
      }

  const zero = toFloat16(0);
  for (let i = 0; i < texels; i++) {
    const source = sources[i];
    if (source < 0) {
      out[i * 2] = Number.isFinite(times[i]) ? toFloat16(times[i]) : zero;
      out[i * 2 + 1] = zero;
      continue;
    }
    out[i * 2] = toFloat16(times[source]);
    out[i * 2 + 1] = toFloat16(
      edgeStrength(source % size, Math.floor(source / size), size)
    );
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
  /** The swash field over the same grid (packSwashField). */
  readonly swashTexture: GPUTexture;
  /** World xz of the grid's centre. */
  centreX = 0;
  centreZ = 0;
  readonly stats: ShoreFieldStats = {
    water: 0,
    sources: 0,
    reached: 0,
    sourceDepth: 0,
    longest: 0,
  };

  private depth = new Float32Array(SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS);
  private times = new Float32Array(SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS);
  private costs = new Float32Array(SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS);
  private reached = new Uint8Array(SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS);
  private packed = new Uint16Array(SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS * 4);
  private packedSwash = new Uint16Array(
    SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS * 2
  );
  private swashSteps = new Int8Array(SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS);
  private swashSources = new Int32Array(
    SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS
  );
  private shoreX = new Float32Array(SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS);
  private shoreZ = new Float32Array(SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS);
  private shoreStrength = new Float32Array(
    SHORE_FIELD_TEXELS * SHORE_FIELD_TEXELS
  );
  private shoreCount = 0;
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
    this.swashTexture = device.createTexture({
      label: 'swash field',
      size: [SHORE_FIELD_TEXELS, SHORE_FIELD_TEXELS],
      format: 'rg16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
  }

  /**
   * The point of the waterline the waves reach nearest to world (`x`, `z`),
   * from the last build, into `out`. False, and `out` untouched, when the
   * grid holds none.
   */
  nearestShore(x: number, z: number, out: ShorePoint): boolean {
    let best = -1;
    let bestSq = Infinity;
    for (let i = 0; i < this.shoreCount; i++) {
      const dx = this.shoreX[i] - x;
      const dz = this.shoreZ[i] - z;
      const sq = dx * dx + dz * dz;
      if (sq < bestSq) {
        bestSq = sq;
        best = i;
      }
    }
    if (best < 0) return false;
    out.x = this.shoreX[best];
    out.z = this.shoreZ[best];
    out.distance = Math.sqrt(bestSq);
    out.strength = this.shoreStrength[best];
    return true;
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
      packSwashField(
        this.times,
        this.reached,
        this.depth,
        size,
        this.packedSwash,
        this.swashSteps,
        this.swashSources
      );
      device.queue.writeTexture(
        { texture: this.swashTexture },
        this.packedSwash as BufferSource,
        { bytesPerRow: size * 4 },
        { width: size, height: size }
      );
      this.shoreCount = collectShore(
        this.depth,
        this.reached,
        size,
        texel,
        originX,
        originZ,
        this.shoreX,
        this.shoreZ,
        this.shoreStrength
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

    const sourceDepth = solveArrival(
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
    stats.sourceDepth = sourceDepth;
    for (let i = 0; i < size * size; i++) {
      if (this.depth[i] > 0) stats.water++;
      if (sourceDepth > 0 && this.depth[i] >= sourceDepth) stats.sources++;
      const t = this.times[i];
      if (t !== Infinity) {
        stats.reached++;
        if (t > stats.longest) stats.longest = t;
      }
    }
  }

  dispose(): void {
    this.texture.destroy();
    this.swashTexture.destroy();
  }
}
