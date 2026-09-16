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
   * Sample each layer's detail normal map.
   *
   * When false the macro normal stands in for it — but only where the material
   * has one. A layer with no macro normal keeps its detail map whatever this
   * says, because the fallback there is a flat tangent normal, which is uniform
   * full diffuse and washes the surface out completely.
   */
  detailNormal: boolean;
  /**
   * Metres at which surface relief starts fading out, and where it is gone.
   *
   * The strongest lever here. Past the end distance a fragment skips the march
   * on the existing amplitude test and keeps only the macro normal, and screen
   * area grows with the square of distance, so pulling these in takes the march
   * off most of the screen.
   *
   * Uniforms rather than defines, so they cost no recompile.
   */
  detailFadeStart: number;
  detailFadeEnd: number;
}

const TIERS: Record<RenderQuality, TerrainQualityTier> = {
  ultra: {
    noTileBlend: true,
    detailNormal: true,
    pomMinSteps: 12,
    pomMaxSteps: 24,
    pomRefineSteps: 6,
    parallax: true,
    detailFadeStart: 200,
    detailFadeEnd: 280,
  },
  high: {
    noTileBlend: true,
    detailNormal: true,
    pomMinSteps: 8,
    pomMaxSteps: 16,
    pomRefineSteps: 6,
    parallax: true,
    detailFadeStart: 150,
    detailFadeEnd: 200,
  },
  medium: {
    // Measured at 0.14ms against `high`, because the splat loop skips any layer
    // under WEIGHT_EPSILON and most fragments have only one or two above it.
    // Visible tiling was not worth a seventh of a millisecond here.
    noTileBlend: true,
    detailNormal: true,
    pomMinSteps: 6,
    pomMaxSteps: 12,
    pomRefineSteps: 4,
    parallax: true,
    detailFadeStart: 90,
    detailFadeEnd: 130,
  },
  low: {
    noTileBlend: false,
    detailNormal: false,
    pomMinSteps: 4,
    pomMaxSteps: 8,
    pomRefineSteps: 3,
    parallax: false,
    detailFadeStart: 45,
    detailFadeEnd: 70,
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
    HAS_TERRAIN_DETAIL_NORMAL: tier.detailNormal,
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
