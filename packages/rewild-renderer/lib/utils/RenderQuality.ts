/**
 * Coarse render-quality tier.
 *
 * A single shared vocabulary so passes don't each invent their own scale. A pass
 * maps the tier onto its own knobs — see SkyQuality.ts for the pattern: a
 * `Record<RenderQuality, ...>` table of per-tier numbers, read when the pass
 * builds its shader module.
 */
export type RenderQuality = 'low' | 'medium' | 'high' | 'ultra';

/** Every tier, cheapest first. Useful for building settings dropdowns. */
export const RENDER_QUALITIES: readonly RenderQuality[] = [
  'low',
  'medium',
  'high',
  'ultra',
];

/**
 * Tier used when nothing has been chosen. Not the highest: `ultra` renders the
 * clouds at full canvas resolution, which costs roughly twice the cloud pixels
 * of `high` and is a deliberate opt-in rather than a starting point.
 */
export const DEFAULT_RENDER_QUALITY: RenderQuality = 'high';

/** Narrows an untrusted string — console input, stored settings — to a tier. */
export function isRenderQuality(value: unknown): value is RenderQuality {
  return (
    typeof value === 'string' &&
    (RENDER_QUALITIES as readonly string[]).includes(value)
  );
}
