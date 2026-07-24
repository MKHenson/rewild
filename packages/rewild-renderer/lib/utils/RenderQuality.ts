/**
 * Coarse render-quality tier.
 *
 * A single shared vocabulary so passes don't each invent their own scale. A pass
 * maps the tier onto its own knobs — see CIRRUS_QUALITY in TemporalCloudRenderer
 * for the pattern: a `Record<RenderQuality, ShaderDefines>` table, plus a
 * `quality` setter that flags the pipeline for rebuild.
 */
export type RenderQuality = 'low' | 'medium' | 'high';

/** Every tier, cheapest first. Useful for building settings dropdowns. */
export const RENDER_QUALITIES: readonly RenderQuality[] = [
  'low',
  'medium',
  'high',
];
