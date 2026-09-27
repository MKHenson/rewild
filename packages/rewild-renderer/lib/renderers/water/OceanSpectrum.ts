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
};

/** JONSWAP's α and peak angular frequency for a wind over a fetch. */
export function jonswapShape(
  windSpeed: number,
  fetchKm: number
): { alpha: number; peakOmega: number } {
  const fetch = Math.max(1, fetchKm) * 1000;
  const speed = Math.max(0.1, windSpeed);
  return {
    alpha: 0.076 * Math.pow((GRAVITY * fetch) / (speed * speed), -0.22),
    peakOmega: 22 * Math.pow((speed * fetch) / (GRAVITY * GRAVITY), -0.33),
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

/** 0 for the longest cascade, 1 for the shortest: how far it takes the chop
 *  variation over the swell's. */
export function cascadeBandPosition(index: number): number {
  return CASCADE_COUNT > 1 ? index / (CASCADE_COUNT - 1) : 0;
}
