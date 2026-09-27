import { RenderQuality } from '../../utils/RenderQuality';
import { ShaderDefines, wgslI32 } from '../../utils/shaderDefines';

/**
 * What each tier costs the water, in one place.
 *
 * Almost all of it is the per-pixel wave normal: every octave it sums is an
 * exp, a sin and a cos, and water draws twice. The octaves that displace the
 * grid are the same on every tier, because the CPU water query sums them to
 * put the player on the surface everyone sees.
 */
interface WaterQualityTier {
  /** Octaves the light draw's normal sums, counting only those with any
   *  height in the water drawn. Loop bound; needs a rebuild. */
  normalOctaves: number;
  /** Octaves the absorb draw's normal sums. It only feeds Fresnel, where
   *  fine detail barely shows. */
  absorbOctaves: number;
  /** Scales each octave's size on screen before its normal fades: more keeps
   *  finer ripples. A uniform. */
  normalFade: number;
}

const TIERS: Record<RenderQuality, WaterQualityTier> = {
  ultra: { normalOctaves: 32, absorbOctaves: 16, normalFade: 1.5 },
  high: { normalOctaves: 24, absorbOctaves: 12, normalFade: 1 },
  medium: { normalOctaves: 16, absorbOctaves: 8, normalFade: 0.7 },
  low: { normalOctaves: 10, absorbOctaves: 6, normalFade: 0.45 },
};

/** Loop bounds the water shader bakes in. WaterPass rebuilds on a change. */
export function waterShaderDefines(quality: RenderQuality): ShaderDefines {
  const tier = TIERS[quality];
  return {
    NORMAL_OCTAVES: wgslI32(tier.normalOctaves),
    ABSORB_OCTAVES: wgslI32(tier.absorbOctaves),
  };
}

/** How fine wave normals carry for a tier, as a scale on each octave's size
 *  on screen before it fades. */
export function waterNormalFade(quality: RenderQuality): number {
  return TIERS[quality].normalFade;
}
