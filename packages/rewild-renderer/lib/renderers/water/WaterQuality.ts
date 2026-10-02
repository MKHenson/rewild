import { RenderQuality } from '../../utils/RenderQuality';

/**
 * What each tier costs the water, in one place.
 *
 * The ocean's slopes are sampled per pixel from mipmapped textures; the tier
 * biases which mip. A sharper mip keeps finer ripples further out, at the
 * risk of shimmer. The displacement and the foam are the same on every tier.
 *
 * Water on the lens (WaterLens) costs most in a storm, when hundreds of drops
 * and their trails are on it: the lower tiers keep fewer drops, blur with
 * fewer taps, and take one sample for a trail.
 *
 * Under water, the light shafts and marine snow are the extras: medium keeps
 * half the snow, and low turns both off. Raindrops rippling wet surfaces and
 * water take two layers, one on medium and none on low.
 */
interface WaterQualityTier {
  /** Mip bias on the ocean slopes: lower is sharper. A uniform. */
  detailBias: number;
  /** Share of the lens's drops kept: the pool, those left on surfacing and
   *  the rain's rate (LensDrops). */
  dropShare: number;
  /** Taps on the ring the lens blurs with, besides the centre. */
  blurTaps: number;
  /** Whether a drop's trail is blurred, or takes one sample. */
  trailBlur: boolean;
  /** Whether light shafts run under water. */
  shafts: boolean;
  /** Share of the marine snow's specks drawn. */
  snowShare: number;
  /** Layers of raindrops rippling wet surfaces and water; 0 is none. */
  rainLayers: number;
}

const TIERS: Record<RenderQuality, WaterQualityTier> = {
  ultra: {
    detailBias: -0.5,
    dropShare: 1,
    blurTaps: 8,
    trailBlur: true,
    shafts: true,
    snowShare: 1,
    rainLayers: 2,
  },
  high: {
    detailBias: 0,
    dropShare: 1,
    blurTaps: 8,
    trailBlur: true,
    shafts: true,
    snowShare: 1,
    rainLayers: 2,
  },
  medium: {
    detailBias: 0.5,
    dropShare: 0.6,
    blurTaps: 6,
    trailBlur: true,
    shafts: true,
    snowShare: 0.5,
    rainLayers: 1,
  },
  low: {
    detailBias: 1,
    dropShare: 0.3,
    blurTaps: 4,
    trailBlur: false,
    shafts: false,
    snowShare: 0,
    rainLayers: 0,
  },
};

/** What water on the lens costs at a tier. */
export function waterLensQuality(
  quality: RenderQuality
): Pick<WaterQualityTier, 'dropShare' | 'blurTaps' | 'trailBlur'> {
  return TIERS[quality];
}

/** The mip bias on the ocean slopes for a tier. */
export function waterDetailBias(quality: RenderQuality): number {
  return TIERS[quality].detailBias;
}

/** What the under-water extras cost at a tier. */
export function underWaterQuality(
  quality: RenderQuality
): Pick<WaterQualityTier, 'shafts' | 'snowShare'> {
  return TIERS[quality];
}

/** Layers of raindrops rippling wet surfaces and water at a tier. */
export function rainPatterLayers(quality: RenderQuality): number {
  return TIERS[quality].rainLayers;
}
