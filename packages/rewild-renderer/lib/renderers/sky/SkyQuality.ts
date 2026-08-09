import { RenderQuality } from '../../utils/RenderQuality';
import { ShaderDefines, wgslF32, wgslI32 } from '../../utils/shaderDefines';

/**
 * Per-tier numbers for every sky pass, in one table.
 *
 * They live together rather than one table per pass because some of them are
 * coupled across passes — see GATE_MARGIN_TEXELS below, where the cloud shader's
 * depth-gate erosion has to stay wider than the bilateral filter that reads its
 * output. A tier defined in two files drifts; a tier defined here cannot.
 *
 * The `high` row reproduces the values that were hardcoded in the shaders, with
 * one deliberate exception: the bilateral kernel comes out at radius 3 rather
 * than the shipped 4, which is a pure saving rather than a quality change — see
 * BILATERAL_RADIUS_OVER_SIGMA.
 *
 * Note that not every field falls with quality. bilateralBlurBoost and
 * bilateralEdgeRelax rise, because that pass exists to hide the cloud target's
 * resolution and the cheaper tiers have more of it to hide.
 */
interface SkyQualityTier {
  /** View-ray steps through the cumulus deck. The dominant cost in the sky. */
  cloudSamples: number;
  /** Steps along the sun ray per lit cumulus sample — multiplies with the above. */
  cloudLightSamples: number;
  /** Sample count the dynamic LOD collapses toward at screen edges and distance. */
  cloudLodSamples: number;
  /** Hard floor under the LOD, so grazing rays keep some structure. */
  cloudMinSamples: number;

  /**
   * Cloud render-target scale, as a fraction of canvas. The single biggest cost
   * lever in the sky: it is quadratic where sample counts are linear, and it
   * multiplies with them. The bilateral inherits it for free by sizing itself
   * from the cloud target.
   *
   * Floored at 0.5 deliberately. The pass marches a 2x2 checkerboard, so only a
   * quarter of these pixels are fresh each frame — at 0.5 that is already just
   * 6% of full-res pixels per frame, and reprojection ghosting scales with it.
   */
  cloudResolutionScale: number;

  /** Taps through the cirrus fallstreak deck. 1 = a flat sheet. */
  cirrusTaps: number;
  /**
   * Extra tightening of the cirrus detail fade, on top of the resolution-driven
   * part computed in cloudShaderDefines. Fading the fine octaves earlier is a
   * saving as well as an anti-shimmer measure, since cirRidge skips two octaves
   * once the weight reaches zero.
   */
  cirrusDetailBias: number;

  /** Steps through the cloud deck when rasterising the shadow map. */
  cloudShadowSamples: number;

  /**
   * Multiplier on the bilateral's spatial sigmas — how hard the cloud buffer is
   * smoothed, in cloud texels.
   *
   * This goes *up* as quality goes down, which is the opposite of every other
   * field here. The bilateral is the pass that hides the cloud target's low
   * resolution, so a cheaper tier needs more of it, not less: at 0.5 scale one
   * cloud texel covers four screen pixels and the checkerboard reconstruction's
   * texel-level disagreement upsamples into visible blocks.
   *
   * The kernel radius is derived from the result (see bilateralRadiusFor), not
   * listed separately. Radius alone is not a blur control — it only bounds the
   * loop, so raising it without the sigma just adds taps weighted near zero.
   */
  bilateralBlurBoost: number;

  /**
   * Multiplier on the bilateral's range sigma — how readily it blurs *across* a
   * cloud/sky edge.
   *
   * Deliberately gentler than bilateralBlurBoost. The range weight is what makes
   * this a bilateral rather than a plain Gaussian, and it also means raising the
   * spatial sigma alone smooths cloud interiors while leaving silhouettes
   * stair-stepped — which is where low-resolution pixelation shows worst. Some
   * relaxation is needed to soften those edges; too much and the clouds go mushy.
   */
  bilateralEdgeRelax: number;

  /**
   * God-ray render-target scale. Also safe to downscale: the shafts are radial
   * and low-frequency, the march is already jittered with interleaved gradient
   * noise, and the result is additive HDR that gets bloomed afterwards.
   */
  godRayScale: number;

  /** God-ray march steps. Unlike the rest this is a uniform, not a define. */
  godRaySamples: number;
}

/** Cloud scale the cirrus detail distances below were originally tuned at. */
const BASE_CLOUD_SCALE = 0.7;

/**
 * Ray length (metres) over which the cirrus fine octaves fade out, at
 * BASE_CLOUD_SCALE. Scaled by the actual cloud resolution in cloudShaderDefines:
 * the fade exists to drop filaments finer than a pixel, so it has to move when
 * the pixel size does. Left fixed, a lower resolution would keep asking for
 * detail it can no longer resolve and the cirrus would crawl.
 */
const CIRRUS_DETAIL_NEAR_BASE = 70000;
const CIRRUS_DETAIL_FAR_BASE = 260000;

/**
 * Bilateral sigmas at bilateralBlurBoost = 1, in cloud texels. Spatial applies
 * overhead, far at the horizon; range is the log-luminance edge-stop.
 */
const BILATERAL_SIGMA_SPATIAL_BASE = 1.1;
const BILATERAL_SIGMA_FAR_BASE = 1.2;
const BILATERAL_SIGMA_RANGE_BASE = 1.5;

/**
 * Kernel half-width divided by the widest spatial sigma in play.
 *
 * For a 2D Gaussian the mass beyond radius r is exp(-r^2 / 2*sigma^2), so this
 * ratio discards ~5% — enough of the tail to be invisible, since the pass
 * renormalises by the accumulated weight and truncation narrows the blur rather
 * than darkening it. Going much tighter turns the quality dial into a visible
 * narrowing; much wider just buys taps weighted near zero.
 */
const BILATERAL_RADIUS_OVER_SIGMA = 2.2;

/** Boosted spatial / far / range sigmas for a tier. */
function bilateralSigmasFor(tier: SkyQualityTier) {
  return {
    spatial: BILATERAL_SIGMA_SPATIAL_BASE * tier.bilateralBlurBoost,
    far: BILATERAL_SIGMA_FAR_BASE * tier.bilateralBlurBoost,
    range: BILATERAL_SIGMA_RANGE_BASE * tier.bilateralEdgeRelax,
  };
}

/**
 * Kernel half-width covering the tier's widest spatial sigma.
 *
 * Derived rather than tabled so the kernel can never be sized against a sigma it
 * no longer matches — and so that GATE_EROSION_TEXELS, which is computed from
 * this, tracks it automatically. Sized on `far` because that is the larger of
 * the two and applies at the horizon.
 */
function bilateralRadiusFor(tier: SkyQualityTier): number {
  const { far } = bilateralSigmasFor(tier);
  return Math.ceil(far * BILATERAL_RADIUS_OVER_SIGMA);
}

const TIERS: Record<RenderQuality, SkyQualityTier> = {
  // cloudResolutionScale 1.0 is what this tier is for: the clouds stop being the
  // one buffer in the frame that gets magnified, so skyBlend's upsample becomes a
  // 1:1 fetch and silhouettes are no longer quantised to a coarser grid than the
  // geometry beside them. Roughly twice the cloud pixels of `high`, and it
  // multiplies with the sample counts.
  //
  // The two bilateral fields go *below* high's 1.0 rather than above, breaking the
  // pattern of the tiers under it. That pass exists to hide the cloud target's
  // resolution; at full resolution there is none to hide, and leaving the blur at
  // high's setting would spend the extra pixels and then smooth them away.
  ultra: {
    cloudSamples: 112,
    cloudLightSamples: 32,
    cloudLodSamples: 64,
    cloudMinSamples: 24,
    cloudResolutionScale: 1.0,
    cirrusTaps: 4,
    cirrusDetailBias: 1.0,
    cloudShadowSamples: 48,
    bilateralBlurBoost: 0.7,
    bilateralEdgeRelax: 0.85,
    godRayScale: 0.7,
    godRaySamples: 64,
  },
  high: {
    cloudSamples: 80,
    cloudLightSamples: 25,
    cloudLodSamples: 40,
    cloudMinSamples: 16,
    cloudResolutionScale: 0.7,
    cirrusTaps: 3,
    cirrusDetailBias: 1.0,
    cloudShadowSamples: 32,
    bilateralBlurBoost: 1.0,
    bilateralEdgeRelax: 1.0,
    godRayScale: 0.5,
    godRaySamples: 48,
  },
  medium: {
    cloudSamples: 56,
    cloudLightSamples: 16,
    cloudLodSamples: 28,
    cloudMinSamples: 12,
    cloudResolutionScale: 0.6,
    cirrusTaps: 2,
    cirrusDetailBias: 0.8,
    cloudShadowSamples: 24,
    bilateralBlurBoost: 1.1,
    bilateralEdgeRelax: 1.2,
    godRayScale: 0.4,
    godRaySamples: 32,
  },
  low: {
    cloudSamples: 36,
    cloudLightSamples: 10,
    cloudLodSamples: 20,
    cloudMinSamples: 8,
    cloudResolutionScale: 0.5,
    cirrusTaps: 1,
    cirrusDetailBias: 0.6,
    cloudShadowSamples: 16,
    bilateralBlurBoost: 1.3,
    bilateralEdgeRelax: 1.45,
    godRayScale: 0.3,
    godRaySamples: 20,
  },
};

/**
 * How far the cloud pass's depth gate is eroded back from terrain silhouettes,
 * beyond the widest filter that reads the cloud texture without a validity test
 * of its own.
 *
 * The gate writes vec4f(0) on texels it skips. Any consumer that filters across
 * those zeros without rejecting them averages black into the pixels beside a
 * ridge and draws a dark outline along it. The bilateral is the binding
 * consumer: bloom reaches further but carries its own coverage weighting, the
 * temporal reprojection is validity-checked, and skyBlend's upsample is only a
 * bilinear footprint. See the comment on GATE_EROSION_TEXELS in
 * cloudsTemporal.wgsl for the full list.
 *
 * Deriving the gate from bilateralRadius rather than hardcoding both is what
 * keeps that invariant true if a tier ever widens the filter.
 */
const GATE_MARGIN_TEXELS = 2;

/**
 * Defines for the temporal cloud module — cloudsTemporal.wgsl and
 * cloudsCirrus.wgsl are compiled into one module, so their defines share a table.
 */
export function cloudShaderDefines(quality: RenderQuality): ShaderDefines {
  const tier = TIERS[quality];

  // Pixels grow as the cloud target shrinks, so the sub-pixel detail fade has to
  // come in proportionally closer. This is the coupling that makes the cirrus
  // safe to render at a lower resolution.
  const detailScale =
    (tier.cloudResolutionScale / BASE_CLOUD_SCALE) * tier.cirrusDetailBias;

  return {
    CLOUD_SAMPLES: wgslI32(tier.cloudSamples),
    CLOUD_LIGHT_SAMPLES: wgslI32(tier.cloudLightSamples),
    // A float: it is an operand of mix(), which takes no abstract int there.
    CLOUD_LOD_SAMPLES: wgslF32(tier.cloudLodSamples),
    CLOUD_MIN_SAMPLES: wgslI32(tier.cloudMinSamples),
    GATE_EROSION_TEXELS: wgslF32(bilateralRadiusFor(tier) + GATE_MARGIN_TEXELS),
    CIRRUS_TAPS: wgslI32(tier.cirrusTaps),
    CIRRUS_DETAIL_NEAR: wgslF32(
      Math.round(CIRRUS_DETAIL_NEAR_BASE * detailScale)
    ),
    CIRRUS_DETAIL_FAR: wgslF32(
      Math.round(CIRRUS_DETAIL_FAR_BASE * detailScale)
    ),
  };
}

/** Cloud render-target scale, as a fraction of canvas. */
export function cloudResolutionScale(quality: RenderQuality): number {
  return TIERS[quality].cloudResolutionScale;
}

export function cloudShadowShaderDefines(
  quality: RenderQuality
): ShaderDefines {
  return { SHADOW_SAMPLES: wgslI32(TIERS[quality].cloudShadowSamples) };
}

export function bilateralShaderDefines(quality: RenderQuality): ShaderDefines {
  return { BILATERAL_RADIUS: wgslI32(bilateralRadiusFor(TIERS[quality])) };
}

/**
 * Spatial / far / range sigmas for the bilateral, in cloud texels.
 *
 * Unlike the radius these are uniforms, so SkyRenderer assigns them onto the
 * pass each init. Assignment rather than multiplication, so repeated inits
 * cannot compound the boost — and note it therefore overwrites any value tweaked
 * by hand at runtime.
 */
export function bilateralSigmas(quality: RenderQuality): {
  spatial: number;
  far: number;
  range: number;
} {
  return bilateralSigmasFor(TIERS[quality]);
}

/** God-ray render-target scale, as a fraction of canvas. */
export function godRayScale(quality: RenderQuality): number {
  return TIERS[quality].godRayScale;
}

/**
 * God-ray march steps. The god-ray shader already reads its sample count from a
 * uniform, so this tier value is written into the config each frame rather than
 * baked into the source — no rebuild needed, and nothing to define.
 */
export function godRaySamples(quality: RenderQuality): number {
  return TIERS[quality].godRaySamples;
}
