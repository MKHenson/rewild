import { WaterType } from '../terrain/Water';

export const GRAVITY = 9.81;

/** Texels per side of every cascade's tile. */
export const FFT_SIZE = 256;

/** Metres per side of each cascade's tile, longest first. The ratios are not
 *  whole numbers, so the tiles never repeat in step. */
export const CASCADE_SIZES = [733, 157, 33.3, 7.1];
export const CASCADE_COUNT = CASCADE_SIZES.length;

/** Seconds the ocean clock runs before it wraps. Every angular frequency is
 *  a whole number of cycles over it, so the wrap is seamless. */
export const OCEAN_LOOP_SECONDS = 1024;

/** Wind speed in m/s the local sea is raised by, from the weather's
 *  windiness 0..1: a sea about 0.2 m high in a calm, 1.3 m at windiness 0.3,
 *  2.5 m at 0.5, 4.4 m at 0.8 and 5.9 m at 1. It climbs as windiness^WIND_CURVE, so a light wind stays
 *  gentle and the top end builds fast. */
export const CALM_WIND_SPEED = 0.5;
export const GALE_WIND_SPEED = 22;
const WIND_CURVE = 1.5;

export function oceanWindSpeed(windiness: number): number {
  const wind = Math.min(1, Math.max(0, windiness));
  return (
    CALM_WIND_SPEED +
    (GALE_WIND_SPEED - CALM_WIND_SPEED) * Math.pow(wind, WIND_CURVE)
  );
}

/**
 * How rough the wind sea looks at windiness 1, past what the spectrum alone
 * gives. A measured sea spectrum reads as a gentle heave at game scale. These
 * make a storm read as rough.
 */
// Scale on the wind sea's wave heights. The energy takes its square.
export const ROUGH_HEIGHT_GAIN = 2.5;
// Share of the wind sea's energy spread over all directions. Waves that cross
// raise pointed, confused peaks instead of orderly rows.
export const ROUGH_OMNI_SHARE = 0.2;
// Sideways displacement as a share of its linear value, from calm to rough.
// Higher pulls crests narrower and sharper. Much past 1.5 folds them over.
export const CALM_CHOPPINESS = 0.8;
export const ROUGH_CHOPPINESS = 1.1;
// Metres: the longest peak wavelength the wind sea may have. A gale's peak is
// near 160 m, a long heave that looks calm near the camera. Holding it shorter
// puts the energy in the waves the viewer sees.
export const LONGEST_PEAK = 90;

/** What the weather's windiness makes of the wind sea. */
export interface SeaState {
  windSpeed: number;
  /** Scale on the wave heights. */
  heightGain: number;
  /** 0..1: share of the energy spread over all directions. */
  omniShare: number;
  choppiness: number;
  /** Metres: the longest peak wavelength. */
  longestPeak: number;
}

/** The wind sea for the weather's windiness 0..1. The roughness climbs like
 *  the wind speed, as windiness^WIND_CURVE. */
export function seaState(windiness: number): SeaState {
  const wind = Math.min(1, Math.max(0, windiness));
  const rough = Math.pow(wind, WIND_CURVE);
  return {
    windSpeed: oceanWindSpeed(wind),
    heightGain: 1 + (ROUGH_HEIGHT_GAIN - 1) * rough,
    omniShare: ROUGH_OMNI_SHARE * rough,
    choppiness: CALM_CHOPPINESS + (ROUGH_CHOPPINESS - CALM_CHOPPINESS) * rough,
    longestPeak: LONGEST_PEAK,
  };
}

/**
 * Crest foam on one cascade. Foam grows where the cascade's surface folds
 * past `whitecap` (the Jacobian: 1 flat, below 0 folded over), so a lower
 * whitecap keeps foam to the steepest crests. `amount` 0..10 sets how fast it
 * grows and how long it lasts: more gives thick caps and long trails.
 */
export interface CascadeFoam {
  whitecap: number;
  amount: number;
}

/** Longest cascade first. The long cascade holds the peak waves, so its foam
 *  caps the big crests. The next adds broken chop. The short two make none. */
export const CASCADE_FOAM: readonly CascadeFoam[] = [
  { whitecap: 0.7, amount: 9 },
  { whitecap: 0.5, amount: 3 },
  { whitecap: 0, amount: 0 },
  { whitecap: 0, amount: 0 },
];

/** Per second: foam grown for each unit the Jacobian is below the whitecap,
 *  and the decay rate, from a foam amount 0..10. */
export function foamRates(amount: number): { grow: number; decay: number } {
  const a = Math.min(10, Math.max(0, amount));
  return { grow: a * 7.5, decay: Math.max(0.5, 10 - a) * 1.15 };
}

/** One sea state in the spectrum: a wind sea or a swell. */
export interface WaveSystem {
  /** Scale on the energy. */
  scale: number;
  windSpeed: number;
  /** Radians, the direction the waves travel. */
  direction: number;
  /** Kilometres of open water the wind has blown over. */
  fetch: number;
  /** 0 a broad cos² spread, 1 the narrower Donelan-Banner spread. */
  spreadBlend: number;
  /** 0..1: narrows the spread further, toward a long swell. */
  swell: number;
  /** JONSWAP γ. */
  peakEnhancement: number;
  /** Metres: waves much shorter than this fade out. */
  shortWavesFade: number;
  /** 0..1: share of the energy spread over all directions. */
  omniShare: number;
  /** Metres: the longest peak wavelength, whatever the wind and fetch. */
  longestPeak: number;
}

/** The local sea the weather raises; its speed and direction follow it. */
export const WIND_SEA: WaveSystem = {
  scale: 1,
  windSpeed: 7,
  direction: 0,
  fetch: 200,
  spreadBlend: 0.85,
  swell: 0.05,
  peakEnhancement: 3.3,
  shortWavesFade: 0.01,
  omniShare: 0,
  longestPeak: LONGEST_PEAK,
};

/** Swell from storms far away: long, narrow and always there. About 0.7 m
 *  high at 210 m, a slow heave under the wind sea; any taller and it hides
 *  the weather's sea and its direction. */
export const SWELL: WaveSystem = {
  scale: 0.02,
  windSpeed: 6,
  direction: 0.35,
  fetch: 1200,
  spreadBlend: 1,
  swell: 0.9,
  peakEnhancement: 3.3,
  shortWavesFade: 0.1,
  omniShare: 0,
  longestPeak: Infinity,
};

/** JONSWAP's α and peak angular frequency for a wind over a fetch. The peak
 *  is held no longer than `longestPeak` metres. */
export function jonswapShape(
  windSpeed: number,
  fetchKm: number,
  longestPeak = Infinity
): { alpha: number; peakOmega: number } {
  const fetch = Math.max(1, fetchKm) * 1000;
  const speed = Math.max(0.1, windSpeed);
  // Deep water: ω² = g k, with k = 2π / λ.
  const shortestOmega = Math.sqrt((GRAVITY * Math.PI * 2) / longestPeak);
  return {
    alpha: 0.076 * Math.pow((GRAVITY * fetch) / (speed * speed), -0.22),
    peakOmega: Math.max(
      22 * Math.pow((speed * fetch) / (GRAVITY * GRAVITY), -0.33),
      shortestOmega
    ),
  };
}

/**
 * Each cascade's band of wavenumbers, [low, high]: from 6 cycles over its own
 * tile to 6 cycles over the next, so every wave lives in exactly one.
 */
export function cascadeBand(index: number): [number, number] {
  const k = (size: number) => ((Math.PI * 2) / size) * 6;
  const low = index === 0 ? 0.0001 : k(CASCADE_SIZES[index]);
  const high = index === CASCADE_COUNT - 1 ? 9999 : k(CASCADE_SIZES[index + 1]);
  return [low, high];
}

/**
 * How strongly a palette type takes a cascade: its wave response, over every
 * cascade up to 8 × its wave scale, fading out by 16 ×. A lake keeps only the
 * short cascades, so its waves stay small however hard the wind blows.
 */
export function cascadeWeight(type: WaterType, size: number): number {
  const t = (size - 8 * type.waveScale) / (8 * type.waveScale);
  const fade = t <= 0 ? 1 : t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
  return type.waveResponse * fade;
}
