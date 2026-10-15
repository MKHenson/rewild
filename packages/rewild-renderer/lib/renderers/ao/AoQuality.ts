import { RenderQuality } from '../../utils/RenderQuality';
import { ShaderDefines, wgslI32 } from '../../utils/shaderDefines';

interface AoQualityTier {
  /** Hemisphere taps per half-resolution texel. 0 turns SSAO off. */
  samples: number;
  /** World-space reach of the hemisphere, in metres. */
  radius: number;
  /** View distance, in metres, over which AO fades out to nothing. */
  fadeStart: number;
  fadeEnd: number;
}

const TIERS: Record<RenderQuality, AoQualityTier> = {
  ultra: { samples: 16, radius: 1.0, fadeStart: 90, fadeEnd: 140 },
  high: { samples: 12, radius: 0.85, fadeStart: 70, fadeEnd: 110 },
  medium: { samples: 8, radius: 0.7, fadeStart: 45, fadeEnd: 75 },
  low: { samples: 0, radius: 0, fadeStart: 0, fadeEnd: 0 },
};

/** SSAO's knobs for a tier. `samples === 0` means the tier draws no AO. */
export function aoConfig(quality: RenderQuality): AoQualityTier {
  return TIERS[quality];
}

export function aoShaderDefines(quality: RenderQuality): ShaderDefines {
  return { AO_SAMPLES: wgslI32(Math.max(1, TIERS[quality].samples)) };
}
