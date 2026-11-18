import { RenderQuality } from '../../utils/RenderQuality';

/**
 * How far scatter draws on each tier, as a fraction of the distances in
 * templates/scatter-layers.json. The table holds the `ultra` distances, and
 * each lower tier pulls in the LOD handovers, the impostor handover and the
 * cull distance by the same fraction. Coarser tiers then take over nearer the
 * viewer, which is where the saving comes from, in the scene pass and in the
 * shadow pass both.
 *
 * Layers that hand over to far sprites keep their cull distance. See
 * `scatterCullDistance`.
 */
const DRAW_DISTANCE_SCALE: Record<RenderQuality, number> = {
  ultra: 1,
  high: 0.85,
  medium: 0.7,
  low: 0.5,
};

/** The fraction of the authored scatter distances a tier draws out to. */
export function scatterDistanceScale(quality: RenderQuality): number {
  return DRAW_DISTANCE_SCALE[quality];
}
