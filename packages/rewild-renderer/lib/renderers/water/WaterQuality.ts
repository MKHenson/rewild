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
}

const TIERS: Record<RenderQuality, WaterQualityTier> = {
  ultra: { detailBias: -0.5, dropShare: 1, blurTaps: 8, trailBlur: true },
  high: { detailBias: 0, dropShare: 1, blurTaps: 8, trailBlur: true },
  medium: { detailBias: 0.5, dropShare: 0.6, blurTaps: 6, trailBlur: true },
  low: { detailBias: 1, dropShare: 0.3, blurTaps: 4, trailBlur: false },
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
