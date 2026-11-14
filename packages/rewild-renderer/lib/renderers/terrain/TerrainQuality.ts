import { RenderQuality } from '../../utils/RenderQuality';
import { ShaderDefines, wgslF32, wgslI32 } from '../../utils/shaderDefines';

/**
 * What each tier costs the terrain pass, in one place.
 *
 * Terrain draws through the main scene pass rather than one of its own, and
 * measures as the largest single item in the frame once foliage is dealt with.
 * Almost all of it is fragment work over a screen the terrain fills, so every
 * field here is either a per-fragment loop bound or the distance past which
 * that loop stops running at all.
 *
 * `high` reproduces the values that were hardcoded in the shader, so the
 * default tier renders exactly what it rendered before this table existed.
 */
interface TerrainQualityTier {
  /**
   * Parallax march steps head-on, where the view ray barely moves across UV.
   * Unused when `parallax` is false.
   */
  pomMinSteps: number;
  /**
   * Parallax march steps at grazing, where the ray sweeps far enough to
   * stair-step through thin ridges without them. The loop runs to this bound
   * and breaks out early, so it sets the worst case rather than the average.
   */
  pomMaxSteps: number;
  /**
   * Bisections refining the crossing the linear march bracketed. Each halves
   * the depth error, so they buy precision far more cheaply than steps do —
   * which is why they fall more slowly down the tiers than the march does.
   */
  pomRefineSteps: number;
  /**
   * Compile the parallax march in at all.
   *
   * The shader already skips the march where relief has faded out. Turning it
   * off removes the loop and its texture samples from the shader instead, so a
   * fragment near the camera stops paying for it too.
   */
  parallax: boolean;
  /**
   * Take the second no-tile tap.
   *
   * Each active splat layer samples albedo, normal and ARM at two offset UVs
   * and mixes them, which is what hides the repeat of a 1K texture across a
   * 240m chunk. It is also half of this loop's texture reads, per layer, on a
   * pass that can have eight layers active. Dropping it is the largest saving
   * available in terrain, and it costs visible tiling.
   */
  noTileBlend: boolean;
  /**
   * Metres at which surface relief starts fading out, and where it is gone.
   *
   * The strongest lever here. Past the end distance a fragment skips both the
   * march and the per-layer detail normal sample, on runtime tests the shader
   * already has, and keeps only the macro normal. Screen area grows with the
   * square of distance, so pulling these in takes that work off most of the
   * screen.
   *
   * Uniforms rather than defines, so they cost no recompile.
   */
  detailFadeStart: number;
  detailFadeEnd: number;
  /**
   * Width in metres of the displaced patch around the camera, 0 for none.
   * Inside it relief is real geometry rather than the parallax march.
   */
  patchSize: number;
  /**
   * Metres between the patch's vertices. Must divide the 2m terrain sample
   * spacing so the patch lattice stays fixed to the world as it follows the
   * camera.
   */
  patchSpacing: number;
}

const TIERS: Record<RenderQuality, TerrainQualityTier> = {
  ultra: {
    noTileBlend: true,
    pomMinSteps: 12,
    pomMaxSteps: 24,
    pomRefineSteps: 6,
    parallax: true,
    detailFadeStart: 200,
    detailFadeEnd: 280,
    patchSize: 80,
    patchSpacing: 0.1,
  },
  high: {
    noTileBlend: true,
    pomMinSteps: 8,
    pomMaxSteps: 16,
    pomRefineSteps: 6,
    parallax: true,
    detailFadeStart: 150,
    detailFadeEnd: 200,
    patchSize: 64,
    patchSpacing: 0.125,
  },
  medium: {
    // Worth 0.14ms here, because the splat loop skips any layer under
    // WEIGHT_EPSILON and most fragments have only one or two above it. Visible
    // tiling is not worth a seventh of a millisecond.
    noTileBlend: true,
    pomMinSteps: 6,
    pomMaxSteps: 12,
    pomRefineSteps: 4,
    parallax: true,
    detailFadeStart: 90,
    detailFadeEnd: 130,
    patchSize: 48,
    patchSpacing: 0.2,
  },
  low: {
    noTileBlend: false,
    pomMinSteps: 4,
    pomMaxSteps: 8,
    pomRefineSteps: 3,
    parallax: false,
    detailFadeStart: 45,
    detailFadeEnd: 70,
    patchSize: 0,
    patchSpacing: 0.1,
  },
};

/**
 * Loop bounds the terrain shader bakes in.
 *
 *     const defines = terrainShaderDefines('medium');
 *     composeShader([terrainShader], defines);
 *
 * Changing these needs a pipeline rebuild, which TerrainPass does when it sees
 * the tier move.
 */
export function terrainShaderDefines(quality: RenderQuality): ShaderDefines {
  const tier = TIERS[quality];
  return {
    // Floats: both are operands of mix(), which takes no abstract int.
    POM_MIN_STEPS: wgslF32(tier.pomMinSteps),
    POM_MAX_STEPS: wgslF32(tier.pomMaxSteps),
    POM_REFINE_STEPS: wgslI32(tier.pomRefineSteps),
    HAS_TERRAIN_PARALLAX: tier.parallax,
    HAS_TERRAIN_NO_TILE: tier.noTileBlend,
  };
}

/**
 * Relief fade distances in metres, for a tier.
 *
 *     const { start, end } = terrainDetailFade('low'); // 45, 70
 *
 * Uniforms, so TerrainPass assigns them onto TerrainUniforms rather than
 * rebuilding anything.
 */
export function terrainDetailFade(quality: RenderQuality): {
  start: number;
  end: number;
} {
  const tier = TIERS[quality];
  return { start: tier.detailFadeStart, end: tier.detailFadeEnd };
}

/**
 * The displaced patch's width and vertex spacing in metres, or null for a tier
 * that draws none.
 *
 *     terrainPatch('high'); // { size: 32, spacing: 0.08 }
 */
export function terrainPatch(
  quality: RenderQuality
): { size: number; spacing: number } | null {
  const tier = TIERS[quality];
  if (tier.patchSize <= 0) return null;
  return { size: tier.patchSize, spacing: tier.patchSpacing };
}
