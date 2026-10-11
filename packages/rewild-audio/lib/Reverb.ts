/** The shape of the reverb. */
export interface ReverbShape {
  /** Seconds the reverb takes to fall by 60 dB. */
  seconds: number;
  /** Loudness of the reverb against the dry sound. */
  gain: number;
  /** Seconds before the reverb begins. */
  predelay: number;
  /** Low-pass on the start of the reverb, in Hz. The tail darkens to a quarter of it. */
  cutoff: number;
}

export const DEFAULT_REVERB_SHAPE: Readonly<ReverbShape> = {
  seconds: 3.5,
  gain: 0.16,
  predelay: 0.02,
  cutoff: 5000,
};

/** Seconds the reverb takes to rise, so its start has no click. */
const RISE = 0.01;
const MAX_SECONDS = 10;
/** Natural log of 1000: a fall by 60 dB. */
const LN_60_DB = Math.log(1000);

const SEED = 0x5eed;

/** A seeded random number in [-1, 1), so every context builds the same reverb. */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Seconds of impulse response `shape` needs. */
export function reverbSeconds(shape: ReverbShape): number {
  return Math.min(
    MAX_SECONDS,
    Math.max(0.1, shape.predelay + shape.seconds + RISE)
  );
}

/**
 * Writes a reverb into two channels of the same length: noise, different in
 * each ear, falling by 60 dB over `seconds` and darkening as it falls.
 * Scaled so its energy is `gain` squared, so the reverb of a sound is about
 * `gain` times as loud as the sound.
 */
export function writeReverbImpulse(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  shape: ReverbShape = DEFAULT_REVERB_SHAPE
): void {
  left.fill(0);
  right.fill(0);
  const random = noise(SEED);
  const start = Math.round(shape.predelay * sampleRate);
  const decay = Math.max(0.01, shape.seconds) / LN_60_DB;
  const cutoff = Math.max(20, shape.cutoff);
  let yl = 0;
  let yr = 0;
  let energy = 0;
  for (let i = start; i < left.length; i++) {
    const t = (i - start) / sampleRate;
    const fall = Math.exp(-t / decay);
    const hz = cutoff * (0.25 + 0.75 * fall);
    const a = 1 - Math.exp((-2 * Math.PI * hz) / sampleRate);
    const envelope = Math.min(1, t / RISE) * fall;
    yl += a * (random() - yl);
    yr += a * (random() - yr);
    left[i] = yl * envelope;
    right[i] = yr * envelope;
    energy += left[i] * left[i] + right[i] * right[i];
  }
  if (energy <= 0) return;
  const scale = shape.gain / Math.sqrt(energy / 2);
  for (let i = start; i < left.length; i++) {
    left[i] *= scale;
    right[i] *= scale;
  }
}
