import { RenderQuality } from '../utils/RenderQuality';
import { ShaderDefines, wgslF32, wgslI32 } from '../utils/shaderDefines';

/**
 * Bloom's mapping from the app-wide quality tier onto its own knobs.
 *
 * The active tier is owned by `renderer.quality` (see QualitySettings); this
 * table is bloom's private business. It lives next to BloomPass rather than in
 * SkyQuality because bloom is no longer sky-specific — it sources the whole
 * composited frame.
 */
interface BloomQualityTier {
  /**
   * Bloom render-target scale, as a fraction of canvas. The safest thing in the
   * chain to downscale — the output is a wide Gaussian, so it has no high
   * frequencies to lose.
   *
   * The kernel radius is *derived* from this (see bloomShaderDefines) rather
   * than listed per tier, because what should stay constant across tiers is the
   * bloom's width on screen. Two independent numbers would let the glow silently
   * change size with quality. Downscaling therefore saves twice over: fewer
   * pixels, and fewer taps to cover the same screen distance.
   */
  bloomScale: number;
}

/**
 * How far the bloom reaches across the screen, in full-resolution pixels. This
 * is the artistic constant; radius and sigma per tier fall out of it and
 * bloomScale. Changing it changes the look at every tier, which is the point.
 */
const BLOOM_SCREEN_EXTENT_PX = 30;

/**
 * Kernel half-width divided by sigma. At ~1.9 the Gaussian still has a
 * non-trivial tail at the cut, so radius and sigma must move together or the
 * bloom gets hard-edged rather than narrower.
 */
const BLOOM_RADIUS_OVER_SIGMA = 1.875;

const TIERS: Record<RenderQuality, BloomQualityTier> = {
  ultra: { bloomScale: 0.6 },
  high: { bloomScale: 0.5 },
  medium: { bloomScale: 0.4 },
  low: { bloomScale: 0.3 },
};

export function bloomShaderDefines(quality: RenderQuality): ShaderDefines {
  const tier = TIERS[quality];

  // Radius is in texels of the bloom target, so covering a fixed screen distance
  // takes proportionally fewer of them as the target shrinks. Deriving it here
  // is what makes downscaling save twice — fewer pixels and fewer taps — while
  // the glow stays the same size on screen.
  const radius = Math.max(
    2,
    Math.round(BLOOM_SCREEN_EXTENT_PX * tier.bloomScale)
  );

  return {
    BLOOM_RADIUS: wgslI32(radius),
    BLOOM_SIGMA: wgslF32(
      Math.round((radius / BLOOM_RADIUS_OVER_SIGMA) * 100) / 100
    ),
  };
}

/** Bloom render-target scale, as a fraction of canvas. */
export function bloomScale(quality: RenderQuality): number {
  return TIERS[quality].bloomScale;
}
