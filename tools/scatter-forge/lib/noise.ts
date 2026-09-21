// Tileable noise bases. Periodic by construction because the bark band has to
// meet itself where the ring closes and where the length repeat wraps: a
// non-tiling field puts a hard line down every trunk in the world.
//
// Everything here takes its period in lattice cells and wraps the lattice, so
// an octave sum, a domain warp and a cellular field all repeat on the same
// boundary and can be combined freely.

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

// Quintic, so the second derivative is continuous too. Gradient noise shows its
// interpolant as faint creases along the lattice under a normal map, and cubic
// is not smooth enough to hide them.
const quintic = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

function wrap(value: number, period: number): number {
  const m = value % period;
  return m < 0 ? m + period : m;
}

/** A noise basis: a value in 0..1 at (x, y), wrapping at (periodX, periodY). */
export type NoiseBasis = (
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  seed: number
) => number;

/** Value noise on an integer lattice, wrapping at (periodX, periodY). */
export const valueNoise: NoiseBasis = (x, y, periodX, periodY, seed) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);

  const xa = wrap(x0, periodX);
  const xb = wrap(x0 + 1, periodX);
  const ya = wrap(y0, periodY);
  const yb = wrap(y0 + 1, periodY);

  const top = hash(xa, ya, seed) + (hash(xb, ya, seed) - hash(xa, ya, seed)) * fx;
  const bottom = hash(xa, yb, seed) + (hash(xb, yb, seed) - hash(xa, yb, seed)) * fx;
  return top + (bottom - top) * fy;
};

/**
 * Gradient (Perlin) noise, wrapping the same way.
 *
 * The default basis, because value noise interpolates between lattice *values*
 * and so carries almost no detail within a cell. That is what makes a stack of
 * value octaves read as blurred mud however many you add. Gradient noise puts a
 * zero crossing at every lattice point instead, so each octave contributes
 * structure rather than another soft blob.
 */
export const gradientNoise: NoiseBasis = (x, y, periodX, periodY, seed) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;

  const xa = wrap(x0, periodX);
  const xb = wrap(x0 + 1, periodX);
  const ya = wrap(y0, periodY);
  const yb = wrap(y0 + 1, periodY);

  // A unit gradient per lattice point, taken off the same hash.
  const dot = (gx: number, gy: number, dx: number, dy: number): number => {
    const angle = hash(gx, gy, seed) * Math.PI * 2;
    return Math.cos(angle) * dx + Math.sin(angle) * dy;
  };

  const u = quintic(fx);
  const v = quintic(fy);

  const top = dot(xa, ya, fx, fy) + (dot(xb, ya, fx - 1, fy) - dot(xa, ya, fx, fy)) * u;
  const bottom = dot(xa, yb, fx, fy - 1) + (dot(xb, yb, fx - 1, fy - 1) - dot(xa, yb, fx, fy - 1)) * u;

  // Perlin's range is roughly ±sqrt(2)/2 in 2D, so this lands inside 0..1 with
  // a little headroom rather than clipping the extremes flat.
  return (top + (bottom - top) * v) * 0.7071 + 0.5;
};

/** Hermite ease between two edges, clamped. Flat at both ends, which is what
 *  makes it the right shape for a field that has to start from nothing. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface FbmOptions {
  gain?: number;
  basis?: NoiseBasis;
}

/**
 * Octave sum. The lattice period doubles with the frequency, so every octave
 * wraps on the same boundary and the sum tiles too.
 */
export function fbm(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  octaves: number,
  seed: number,
  { gain = 0.5, basis = gradientNoise }: FbmOptions = {}
): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;

  for (let o = 0; o < octaves; o++) {
    const step = 1 << o;
    sum += basis(x * step, y * step, periodX * step, periodY * step, seed + o * 7919) * amplitude;
    total += amplitude;
    amplitude *= gain;
  }

  return sum / total;
}

/**
 * Half the range an octave sum actually occupies, by octave count, measured at
 * the 5th and 95th percentiles.
 *
 * An fbm does **not** fill 0..1. It clusters hard around 0.5 and reaches
 * roughly 0.35..0.66 at four octaves, because summing independent octaves
 * averages toward the mean. Treating its output as if it spanned the full range
 * makes every threshold and every signed offset far weaker than it reads on the
 * page, and the symptom is a parameter that appears to do nothing.
 */
const FBM_HALF_RANGE: Record<number, number> = { 1: 0.29, 2: 0.2, 3: 0.17, 4: 0.16, 5: 0.155 };

/** fbm remapped to -1..1 across the range it occupies rather than the one it does not. */
export function signedFbm(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  octaves: number,
  seed: number,
  options: FbmOptions = {}
): number {
  const spread = FBM_HALF_RANGE[octaves] ?? 0.15;
  const centred = (fbm(x, y, periodX, periodY, octaves, seed, options) - 0.5) / spread;
  return Math.max(-1, Math.min(1, centred));
}

/** Creases rather than blobs — the shape bark grooves want. */
export function ridged(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  octaves: number,
  seed: number,
  options: FbmOptions = {}
): number {
  return 1 - Math.abs(fbm(x, y, periodX, periodY, octaves, seed, options) * 2 - 1);
}

/**
 * Displaces the sample point by a noise field before reading it. This is the
 * cheapest way to get structure that looks grown rather than sprinkled: an
 * octave sum is isotropic and blobby at every scale, and warping it stretches
 * and folds those blobs into fibres.
 *
 * The warp field carries the same periods as whatever reads the result, so a
 * periodic field displaced by a periodic offset stays periodic.
 */
export function warp(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  seed: number,
  strength: number,
  octaves = 2
): [number, number] {
  const dx = fbm(x, y, periodX, periodY, octaves, seed ^ 0x1f83d9ab) * 2 - 1;
  const dy = fbm(x, y, periodX, periodY, octaves, seed ^ 0x5be0cd19) * 2 - 1;
  return [x + dx * strength, y + dy * strength];
}

/**
 * `warp` into a pair the caller owns.
 *
 * For callers that warp several times per texel — a layer measuring its own
 * deformation needs three — where a returned tuple each time is an allocation
 * per texel of a half-million-texel band.
 */
export function warpInto(
  into: number[],
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  seed: number,
  strength: number,
  octaves = 2
): void {
  const dx = fbm(x, y, periodX, periodY, octaves, seed ^ 0x1f83d9ab) * 2 - 1;
  const dy = fbm(x, y, periodX, periodY, octaves, seed ^ 0x5be0cd19) * 2 - 1;
  into[0] = x + dx * strength;
  into[1] = y + dy * strength;
}

export interface WorleyResult {
  /** Distance to the nearest feature point, in cells. */
  f1: number;
  /** Distance to the second nearest. `f2 - f1` is the cell border. */
  f2: number;
  /**
   * The winning cell's own random value, 0..1. Constant across a cell and
   * discontinuous at its border, so read it only for something a feature at
   * that border hides — a per-plate height, where the border is the fissure.
   */
  id: number;
  /**
   * Vector from the nearest feature point to the second nearest, in cells. It
   * is the normal of the border the two share, so its direction says which way
   * that border runs, which is how a field can treat an along-trunk fissure
   * differently from a cross one without being two fields.
   */
  nx: number;
  ny: number;
}

/**
 * Cellular (Worley) noise, wrapping at the same periods, written into a result
 * the caller owns.
 *
 * Neither value nor gradient noise can produce a plate-and-fissure structure,
 * because both are sums of smooth bumps and bark is a partition. `f1` gives the
 * plates and `f2 - f1` the cracks between them, which is the shape the eye
 * actually reads as bark rather than as wood grain.
 *
 * The band is half a million texels and the bark stack reads several of these
 * at each, so this fills a struct rather than returning one.
 */
export function worleyInto(
  into: WorleyResult,
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  seed: number,
  jitter = 1
): WorleyResult {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);

  let f1 = Infinity;
  let f2 = Infinity;
  let id = 0;
  let firstX = 0;
  let firstY = 0;
  let secondX = 0;
  let secondY = 0;

  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const gx = cellX + ox;
      const gy = cellY + oy;
      const wx = wrap(gx, periodX);
      const wy = wrap(gy, periodY);

      // The feature point is drawn from the wrapped cell but placed at the
      // unwrapped one, which is what makes the field continue across the seam.
      const px = gx + 0.5 + (hash(wx, wy, seed) - 0.5) * jitter;
      const py = gy + 0.5 + (hash(wx, wy, seed ^ 0x9e3779b9) - 0.5) * jitter;

      const distance = Math.hypot(px - x, py - y);
      if (distance < f1) {
        f2 = f1;
        secondX = firstX;
        secondY = firstY;
        f1 = distance;
        firstX = px;
        firstY = py;
        id = hash(wx, wy, seed ^ 0x51ed270b);
      } else if (distance < f2) {
        f2 = distance;
        secondX = px;
        secondY = py;
      }
    }
  }

  into.f1 = f1;
  into.f2 = f2;
  into.id = id;
  into.nx = secondX - firstX;
  into.ny = secondY - firstY;
  return into;
}

/** `worleyInto` into a fresh result. */
export function worley(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  seed: number,
  jitter = 1
): WorleyResult {
  return worleyInto({ f1: 0, f2: 0, id: 0, nx: 0, ny: 0 }, x, y, periodX, periodY, seed, jitter);
}

// 3D bases, for a solid rather than a band. Nothing here wraps: a rock is a
// field sampled at a position on its surface, and the only seam it could have
// is one the field is not asked to cross.

export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

// A unit gradient per lattice point, drawn uniformly over the sphere.
function gradientDot3(gx: number, gy: number, gz: number, seed: number, dx: number, dy: number, dz: number): number {
  const u = hash3(gx, gy, gz, seed) * 2 - 1;
  const phi = hash3(gx, gy, gz, seed ^ 0x5bd1e995) * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return Math.cos(phi) * r * dx + Math.sin(phi) * r * dy + u * dz;
}

/** Gradient noise on a 3D lattice, 0..1. */
export function gradientNoise3(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;

  const u = quintic(fx);
  const v = quintic(fy);
  const w = quintic(fz);

  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

  const c000 = gradientDot3(x0, y0, z0, seed, fx, fy, fz);
  const c100 = gradientDot3(x0 + 1, y0, z0, seed, fx - 1, fy, fz);
  const c010 = gradientDot3(x0, y0 + 1, z0, seed, fx, fy - 1, fz);
  const c110 = gradientDot3(x0 + 1, y0 + 1, z0, seed, fx - 1, fy - 1, fz);
  const c001 = gradientDot3(x0, y0, z0 + 1, seed, fx, fy, fz - 1);
  const c101 = gradientDot3(x0 + 1, y0, z0 + 1, seed, fx - 1, fy, fz - 1);
  const c011 = gradientDot3(x0, y0 + 1, z0 + 1, seed, fx, fy - 1, fz - 1);
  const c111 = gradientDot3(x0 + 1, y0 + 1, z0 + 1, seed, fx - 1, fy - 1, fz - 1);

  const front = lerp(lerp(c000, c100, u), lerp(c010, c110, u), v);
  const back = lerp(lerp(c001, c101, u), lerp(c011, c111, u), v);

  // Perlin's 3D range is about ±0.87, so this lands inside 0..1 with headroom.
  return lerp(front, back, w) * 0.57 + 0.5;
}

/** Octave sum of `gradientNoise3`, 0..1, clustered about 0.5 like `fbm`. */
export function fbm3(x: number, y: number, z: number, octaves: number, seed: number, gain = 0.5): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;

  for (let o = 0; o < octaves; o++) {
    const step = 1 << o;
    sum += gradientNoise3(x * step, y * step, z * step, seed + o * 7919) * amplitude;
    total += amplitude;
    amplitude *= gain;
  }

  return sum / total;
}

// Rotation applied between octaves, and a lacunarity just off 2, so no two
// octaves share a lattice. Axis-aligned octaves at exactly 2x line their
// creases up, and under a normal map the sum reads as a faint grid.
const OCTAVE_ROTATION = [0.0, -0.8, -0.6, -0.8, 0.36, -0.48, -0.6, -0.48, 0.64];
const OCTAVE_LACUNARITY = 2.04;

/** Octave sum of `gradientNoise3` with every octave turned off the last, 0..1, clustered about 0.5 like `fbm`. */
export function fbm3r(x: number, y: number, z: number, octaves: number, seed: number, gain = 0.5): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  const m = OCTAVE_ROTATION;

  for (let o = 0; o < octaves; o++) {
    sum += gradientNoise3(x, y, z, seed + o * 7919) * amplitude;
    total += amplitude;
    amplitude *= gain;
    const nx = (m[0] * x + m[1] * y + m[2] * z) * OCTAVE_LACUNARITY;
    const ny = (m[3] * x + m[4] * y + m[5] * z) * OCTAVE_LACUNARITY;
    const nz = (m[6] * x + m[7] * y + m[8] * z) * OCTAVE_LACUNARITY;
    x = nx;
    y = ny;
    z = nz;
  }

  return sum / total;
}

/**
 * `fbm3r` as creases rather than blobs.
 *
 * `soften` rounds the crease itself. The ridge comes from an absolute value,
 * whose corner is a knife edge at every zero crossing of the sum, and those
 * corners are most of what keeps a noise surface sharp however the rest of
 * the field is rounded. `sabs` replaces the corner with an arc of that width
 * and is the true absolute value away from it.
 */
export function ridged3r(x: number, y: number, z: number, octaves: number, seed: number, gain = 0.5, soften = 0): number {
  return 1 - sabs(fbm3r(x, y, z, octaves, seed, gain) * 2 - 1, soften);
}

/** `Math.abs` with its corner rounded over a band `k` wide. */
export function sabs(v: number, k: number): number {
  return k > 0 ? Math.sqrt(v * v + k * k) - k : Math.abs(v);
}

/**
 * Polynomial smooth minimum: `min(a, b)` with the crease between them rounded
 * over a band `k` wide. `k` 0 is the hard minimum.
 */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
}

/** `smin` for the maximum. */
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

/** `fbm3` remapped to -1..1 across the range it occupies. */
export function signedFbm3(x: number, y: number, z: number, octaves: number, seed: number, gain = 0.5): number {
  const spread = FBM_HALF_RANGE[octaves] ?? 0.15;
  const centred = (fbm3(x, y, z, octaves, seed, gain) - 0.5) / spread;
  return Math.max(-1, Math.min(1, centred));
}

/** Creases rather than blobs, in 3D. */
export function ridged3(x: number, y: number, z: number, octaves: number, seed: number, gain = 0.5): number {
  return 1 - Math.abs(fbm3(x, y, z, octaves, seed, gain) * 2 - 1);
}

export interface Worley3Result {
  /** Distance to the nearest feature point, in cells. */
  f1: number;
  /** Distance to the second nearest. `f2 - f1` is 0 on a cell border. */
  f2: number;
  /** The winning cell's own random value, 0..1. */
  id: number;
}

/** Cellular noise on a 3D lattice, written into a result the caller owns. */
export function worley3Into(into: Worley3Result, x: number, y: number, z: number, seed: number, jitter = 1): Worley3Result {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const cellZ = Math.floor(z);

  let f1 = Infinity;
  let f2 = Infinity;
  let id = 0;

  for (let oz = -1; oz <= 1; oz++)
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cellX + ox;
        const gy = cellY + oy;
        const gz = cellZ + oz;

        const px = gx + 0.5 + (hash3(gx, gy, gz, seed) - 0.5) * jitter;
        const py = gy + 0.5 + (hash3(gx, gy, gz, seed ^ 0x9e3779b9) - 0.5) * jitter;
        const pz = gz + 0.5 + (hash3(gx, gy, gz, seed ^ 0x3c6ef372) - 0.5) * jitter;

        const distance = Math.hypot(px - x, py - y, pz - z);
        if (distance < f1) {
          f2 = f1;
          f1 = distance;
          id = hash3(gx, gy, gz, seed ^ 0x51ed270b);
        } else if (distance < f2) {
          f2 = distance;
        }
      }

  into.f1 = f1;
  into.f2 = f2;
  into.id = id;
  return into;
}

/** `worley3Into` into a fresh result. */
export function worley3(x: number, y: number, z: number, seed: number, jitter = 1): Worley3Result {
  return worley3Into({ f1: 0, f2: 0, id: 0 }, x, y, z, seed, jitter);
}
