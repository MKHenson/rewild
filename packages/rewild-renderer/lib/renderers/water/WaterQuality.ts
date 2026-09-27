import { RenderQuality } from '../../utils/RenderQuality';

/**
 * What each tier costs the water, in one place.
 *
 * The ocean's slopes are sampled per pixel from mipmapped textures; the tier
 * biases which mip. A sharper mip keeps finer ripples further out, at the
 * risk of shimmer. The displacement and the foam are the same on every tier.
 */
interface WaterQualityTier {
  /** Mip bias on the ocean slopes: lower is sharper. A uniform. */
  detailBias: number;
}

const TIERS: Record<RenderQuality, WaterQualityTier> = {
  ultra: { detailBias: -0.5 },
  high: { detailBias: 0 },
  medium: { detailBias: 0.5 },
  low: { detailBias: 1 },
};

/** The mip bias on the ocean slopes for a tier. */
export function waterDetailBias(quality: RenderQuality): number {
  return TIERS[quality].detailBias;
}
