import { RenderQuality } from '../../utils/RenderQuality';

/**
 * What each tier costs the directional shadow pass.
 *
 * The pass is bound by two things: the number of atlas texels it rasterises
 * every caster into three times over, and how much of the world those casters
 * come from. Every field here moves one of the two.
 *
 * `high` reproduces the values that were hardcoded in the renderer, so the
 * default tier renders exactly what it rendered before this table existed.
 */
interface ShadowQualityTier {
  /**
   * Edge of one cascade's atlas quadrant, in texels. The atlas is twice this
   * on a side (three cascades plus the spot light's quadrant), at 4 bytes per
   * texel: 2048 costs 64 MB and four times the fill of 1024.
   *
   * The lever for sharpness. A cascade's texel is its fitted box divided by
   * this, so doubling it halves the ground each texel covers in every cascade
   * at once — the mid cascade, which shades the ground a player actually looks
   * at, goes from ~20 cm texels to ~10 cm.
   */
  cascadeSize: number;
  /**
   * View-space distance past which nothing receives a directional shadow.
   *
   * The far cascade spreads its texels over everything from the mid split to
   * here, so pulling this in sharpens the distance for free — at the price of
   * shadows ending sooner. It also drags the nearer splits in with it, so the
   * near cascades tighten a little too.
   */
  shadowFar: number;
}

const TIERS: Record<RenderQuality, ShadowQualityTier> = {
  // The extra texels are spent on sharpness rather than range: at 2048 the far
  // cascade covers 600 m at finer texels than high covers 500.
  ultra: {
    cascadeSize: 2048,
    shadowFar: 600,
  },
  high: {
    cascadeSize: 1024,
    shadowFar: 500,
  },
  // Texels near enough to high's for the near cascade to hold up; the range is
  // where this tier gives ground.
  medium: {
    cascadeSize: 768,
    shadowFar: 350,
  },
  low: {
    cascadeSize: 512,
    shadowFar: 250,
  },
};

/**
 * Atlas quadrant edge and shadow range for a tier.
 *
 *     const { cascadeSize, shadowFar } = shadowConfig('medium'); // 768, 350
 *
 * A cascadeSize change means a new atlas texture, which
 * DirectionalShadowRenderer does when it sees the tier move.
 */
export function shadowConfig(quality: RenderQuality): ShadowQualityTier {
  return TIERS[quality];
}
