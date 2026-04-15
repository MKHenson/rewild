# Phase 6: Dual-Layer Clouds (Optional)

## Summary

Add a second, high-altitude cirrus cloud layer (6-8 km) above the existing cumulus layer (1.2-1.8 km). This creates more visual variety and depth in the sky — thin wispy clouds at height contrasting with the heavier volumetric clouds below. This phase is **optional** and should only be attempted if Phase 5 delivers enough performance headroom.

## Motivation

Real skies often have multiple cloud layers at different altitudes. The current single cumulus layer looks good but can feel monotonous across long play sessions. A high-altitude cirrus layer adds:

- Visual depth (layers create parallax when the camera moves)
- Weather variety (cirrus without cumulus = fair weather; both = changing conditions)
- Atmospheric scale (seeing clouds at vastly different heights reinforces the size of the world)
- Sunset/sunrise beauty (cirrus catches light differently than cumulus — they're thinner and lit from below at sunset)

Cirrus clouds are thin, wispy, and ice-crystal-based. They're much simpler to render than cumulus — fewer samples, simpler noise, no heavy scattering. This keeps the performance cost low.

## Prerequisites

- **Phase 5** completed with performance target met (cloud pass < 2ms)
- At least **2-3ms frame time headroom** remaining in the 8.3ms budget
- All altitude cases working (Phase 3) — the cirrus layer is at 6-8km, well above the existing cumulus
- Phase 0 GPU Performance Monitor available for validation

## Gate Check

**Before starting this phase, measure:**

- Total sky system time with Phase 5 optimizations
- If sky system > 5ms, **do not proceed** — optimize Phase 5 further or skip this phase
- If sky system < 4ms, proceed — there's ~4ms headroom for the second layer

## Architecture

```
Altitude
10km  ─────────────────────────────────────
       (empty sky)
8km   ═══════════════════════════════════════  ← Cirrus layer top
       Cirrus clouds (thin, wispy, ice)
6km   ═══════════════════════════════════════  ← Cirrus layer base
       (empty sky gap — ~4.2km between layers)
1.8km ═══════════════════════════════════════  ← Cumulus layer top
       Cumulus clouds (thick, volumetric)
1.2km ═══════════════════════════════════════  ← Cumulus layer base
       (atmosphere below clouds)
0km   ───────────────────────────────────────  ← Ground
```

The two layers are rendered independently to separate textures and composited back-to-front (cirrus behind cumulus). The cirrus renderer is a simplified version of the cumulus renderer — same architectural pattern but cheaper settings.

### Rendering Order

```
1. Cirrus clouds  (far away, behind everything)
2. Cumulus clouds  (closer, in front of cirrus)
3. Atmosphere      (blends with both cloud layers)
4. Post-processing (bloom, god rays, TAA, final composite)
```

In the final composite, cirrus is blended first (it's farther away), then cumulus on top.

## Tasks

### 6.1: Create `CirrusCloudRenderer`

**New file**: `packages/rewild-renderer/lib/renderers/sky/CirrusCloudRenderer.ts`

- [ ] Create class following the same pattern as `CloudsRenderer` but with lighter settings:

  ```typescript
  export class CirrusCloudRenderer {
    renderTarget: GPUTexture; // Half-res like cumulus, or lower
    pipeline: GPURenderPipeline;
    bindGroup: GPUBindGroup;
    uniformBuffer: GPUBuffer;

    // Cirrus-specific config
    altitudeStart: number = 6000; // 6km
    altitudeHeight: number = 2000; // 2km thick
    maxSamples: number = 20; // Much fewer than cumulus (80)
    coverage: number = 0.3; // Default thin coverage
    windSpeed: number = 2.0; // Cirrus moves faster than cumulus
    opacity: number = 0.4; // Thin, translucent
  }
  ```

- [ ] Create render target at **0.5x** resolution (half of the cumulus 0.8x) — cirrus is far away and doesn't need fine detail
- [ ] Create uniform buffer with:
  - Standard camera/time uniforms (shared with cumulus or copied)
  - `CIRRUS_START: f32` = 6000.0
  - `CIRRUS_HEIGHT: f32` = 2000.0
  - `cirrusCoverage: f32` (0-1, how much of the sky has cirrus)
  - `cirrusWindSpeed: f32` (multiplier on wind animation)
  - `cirrusOpacity: f32` (0-1, overall transparency)
- [ ] Implement `init()`, `render()`, `resize()`, `dispose()` following the same interface as `CloudsRenderer`

### 6.2: Create cirrus cloud shader

**New file**: `packages/rewild-renderer/lib/shaders/cirrusClouds.wgsl`

- [ ] Simplified version of `clouds.wgsl` optimized for thin, high-altitude clouds:

  ```wgsl
  // Cirrus-specific constants
  const CIRRUS_START = 6000.0;
  const CIRRUS_HEIGHT = 2000.0;
  const CIRRUS_SAMPLES = 20;    // Much fewer than cumulus

  fn cirrusDensity(p: vec3<f32>) -> f32 {
    // Simpler noise than cumulus — 2 octaves instead of 3
    // Produces thin, stretched, wispy patterns
    let windOffset = vec3<f32>(uniforms.iTime * 0.0003 * cirrusWindSpeed, 0.0, 0.0);
    let noisePos = p * 0.0005 + windOffset;

    // Use stretched noise coordinates for elongated wispy shapes
    let stretchedPos = vec3<f32>(noisePos.x * 3.0, noisePos.y, noisePos.z * 3.0);

    var density = fbm2(stretchedPos); // 2-octave FBM (cheaper)
    density -= (1.0 - cirrusCoverage); // Coverage threshold
    density = max(0.0, density) * cirrusOpacity;

    // Height fade: thin at edges, thicker in middle
    let h = (p.y - CIRRUS_START) / CIRRUS_HEIGHT;
    let heightFade = smoothstep(0.0, 0.2, h) * smoothstep(1.0, 0.8, h);
    density *= heightFade;

    return density;
  }
  ```

- [ ] **2-octave FBM** (`fbm2`): Same noise function as cumulus but with only 2 octaves instead of 3. This is the main performance saving — each sample is ~33% cheaper
- [ ] **Simplified lighting**: Cirrus is thin enough that single-scattering approximation is fine:

  ```wgsl
  fn cirrusLighting(density: f32, sunDotDir: f32, height: f32) -> vec3<f32> {
    // Simple phase function (forward scattering)
    let phase = 0.5 + 0.5 * sunDotDir;

    // Cirrus is ice — more specular/bright than cumulus water droplets
    let sunLight = SUN_POWER * phase * exp(-density * 2.0);
    let ambient = mix(CLOUD_AMBIENT_NIGHT_COLOR, CLOUD_AMBIENT_DAY_COLOR, smoothstep(-0.2, 0.8, sunDotUp)) * 0.3;

    return sunLight + ambient;
  }
  ```

  No light ray marching (the `lightRay()` function in cumulus is expensive). Cirrus is thin enough that a simple exponential attenuation estimate suffices

- [ ] **Sphere intersection**: Same math as cumulus `skyRay()` but with `CIRRUS_START` and `CIRRUS_HEIGHT` constants. Apply the same altitude-aware branching from Phase 3
- [ ] The alpha output should represent cirrus transmittance, same format as cumulus

### 6.3: Add layer configuration system

**New file or addition to**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] Add a cloud layer configuration interface:
  ```typescript
  export interface CloudLayerConfig {
    enabled: boolean;
    altitude: number; // Layer base altitude (m)
    thickness: number; // Layer height (m)
    coverage: number; // 0-1, how much sky is covered
    windSpeed: number; // Multiplier on base wind
    opacity: number; // 0-1, master transparency
    maxSamples: number; // Maximum ray march samples
    resolutionScale: number; // Resolution multiplier (0.5 = half res)
  }
  ```
- [ ] Expose two layer configs on `SkyRenderer`:

  ```typescript
  cumulusConfig: CloudLayerConfig = {
    enabled: true,
    altitude: 1200,
    thickness: 600,
    coverage: 0.5,
    windSpeed: 1.0,
    opacity: 1.0,
    maxSamples: 80,
    resolutionScale: 0.8,
  };

  cirrusConfig: CloudLayerConfig = {
    enabled: true,
    altitude: 6000,
    thickness: 2000,
    coverage: 0.3,
    windSpeed: 2.0,
    opacity: 0.4,
    maxSamples: 20,
    resolutionScale: 0.5,
  };
  ```

- [ ] These can be modified at runtime to control weather. Example weather presets:
  - **Clear**: cumulus coverage 0.1, cirrus coverage 0.1
  - **Fair weather**: cumulus 0.3, cirrus 0.4
  - **Partly cloudy**: cumulus 0.5, cirrus 0.3
  - **Overcast**: cumulus 0.8, cirrus 0.0 (cirrus not visible under heavy cumulus)
  - **Stormy**: cumulus 0.9, cirrus 0.0

### 6.4: Composite both layers in final pass

**File**: `packages/rewild-renderer/lib/shaders/atmosphereFinal.wgsl`
**File**: `packages/rewild-renderer/lib/renderers/sky/SkyFinalPass.ts`

- [ ] Add a new texture binding for the cirrus render target
- [ ] Composite back-to-front in the final shader:

  ```wgsl
  // Sample both cloud layers
  let cirrus = textureSample(cirrusTexture, linearSampler, uv);
  let cumulus = textureSample(cumulusTexture, linearSampler, uv);

  // Start with atmosphere (background)
  var finalColor = atmosphere.rgb;

  // Blend cirrus (farther away, behind cumulus)
  finalColor = mix(finalColor, cirrus.rgb, cirrus.a);

  // Blend cumulus (closer, in front of cirrus)
  finalColor = mix(finalColor, cumulus.rgb, cumulus.a);

  // Add god rays (if Phase 4 is active)
  finalColor += godRays.rgb;
  ```

- [ ] Update `SkyFinalPass` bind group to include the cirrus texture
- [ ] When cirrus is disabled, bind a 1×1 transparent texture as a placeholder to avoid pipeline recreation

### 6.5: Wire into `SkyRenderer`

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] Import and instantiate `CirrusCloudRenderer`
- [ ] In `init()`: initialize cirrus renderer
- [ ] In `render()`: render cirrus **before** cumulus (it's farther away):
  ```typescript
  // Render cloud layers (back to front)
  if (this.cirrusConfig.enabled) {
    this.cirrusPass.render(renderer, pass, camera);
  }
  this.cloudsPass.render(renderer, pass, camera); // Existing cumulus
  ```
- [ ] In `resize()`: resize cirrus render target
- [ ] In `dispose()`: dispose cirrus renderer

### 6.6: Apply temporal reprojection to cirrus (if Phase 5 active)

- [ ] If temporal reprojection (Phase 5) is implemented, extend it to cover the cirrus layer too
- [ ] Cirrus changes slowly (thin, high altitude) so temporal reprojection is even more effective — use a lower `blendFactor` (0.05) for more aggressive history reuse
- [ ] Alternatively, skip temporal for cirrus entirely if it's already under budget (~0.3ms at 20 samples, 0.5x res)

### 6.7: Update cloud shadows for dual layers

**File**: `packages/rewild-renderer/lib/renderers/sky/CloudShadowRenderer.ts`

- [ ] Cloud shadows (Phase 2) currently only account for the cumulus layer. Two options:
  1. **Recommended**: Ignore cirrus shadows. Cirrus is thin and high — its shadows on the ground are negligible (barely perceptible in real life). This costs nothing
  2. **Optional**: Add cirrus density to the shadow map. March through both layers when rendering the shadow. Increases shadow pass cost by ~30%
- [ ] If implementing option 2, the shadow shader needs both layer constants (cumulus altitudes + cirrus altitudes) and must march through both height ranges

## Acceptance Criteria

- [ ] High-altitude wispy clouds visible at 6-8km when looking up
- [ ] Cirrus layer visually distinct from cumulus: thinner, wispier, more transparent
- [ ] Both layers visible simultaneously from ground level
- [ ] Parallax effect when camera moves: cirrus moves slower than cumulus (farther away)
- [ ] Cirrus moves faster with wind than cumulus (higher altitude = stronger winds)
- [ ] Flying through cirrus (Phase 3 altitude handling): smooth entry, thin fog effect
- [ ] Flying between layers (2-5km): cumulus visible below, cirrus visible above
- [ ] Sunrise/sunset: cirrus catches light differently (lit from below, ice scattering)
- [ ] Cirrus coverage independently controllable
- [ ] Disabling cirrus (`enabled = false`) skips all cirrus work
- [ ] Performance: cirrus layer < 1ms per frame
- [ ] Total sky system still under target (< 5ms with both layers)
- [ ] Memory: cirrus render target < 5 MB additional

## Performance Budget

| Component                            | Budget       | Notes                             |
| ------------------------------------ | ------------ | --------------------------------- |
| Cirrus render (0.5x res, 20 samples) | < 0.8 ms     | ~200k pixels × 20 samples         |
| Cirrus composite (texture read)      | < 0.05 ms    | Single extra sample in final pass |
| Cirrus temporal (if enabled)         | < 0.1 ms     | Very effective due to slow change |
| **Cirrus total**                     | **< 1.0 ms** |                                   |
| **Sky system total (all phases)**    | **< 5.0 ms** | 60% of 120 FPS budget             |

### Budget breakdown with all phases:

| Pass                                | Cost (ms)   | Phase    |
| ----------------------------------- | ----------- | -------- |
| Cumulus (temporal + LOD)            | 1.0-2.0     | Phase 5  |
| Cirrus                              | 0.5-0.8     | Phase 6  |
| Atmosphere (with cubemap)           | 0.4-0.5     | Phase 1  |
| Cloud shadows (amortized)           | 0.2-0.3     | Phase 2  |
| God rays (half-res)                 | 0.3-0.5     | Phase 4  |
| Post-processing (bloom, TAA, final) | 1.0-1.5     | Existing |
| **Total**                           | **3.4-5.6** |          |

## Testing Checklist

### Visual

- [ ] Ground level: both layers visible, cirrus higher and thinner
- [ ] Cloud gap: looking through a cumulus gap shows cirrus beyond
- [ ] Sunrise: cirrus lit bright orange/pink while cumulus is still in shadow
- [ ] Sunset: similar to sunrise, dramatic lighting on cirrus
- [ ] Night: cirrus barely visible (moonlight), not distracting
- [ ] Overcast cumulus: cirrus not visible (hidden behind dense cumulus)
- [ ] Clear cumulus, visible cirrus: realistic fair-weather sky

### Altitude (Phase 3 integration)

- [ ] Ground (500m): both layers in sky
- [ ] In cumulus (1500m): fog from cumulus, cirrus visible above
- [ ] Between layers (3000m): cumulus below, cirrus above
- [ ] In cirrus (7000m): thin fog from cirrus, cumulus far below
- [ ] Above cirrus (10000m): both layers below

### Performance

- [ ] Measure with GPU Performance Monitor
- [ ] Cirrus disabled: no performance impact
- [ ] Cirrus enabled: < 1ms additional per frame
- [ ] Total sky system: < 5ms

### Configuration

- [ ] `cirrusConfig.enabled = false`: no cirrus rendered, no performance cost
- [ ] `cirrusConfig.coverage = 0`: effectively invisible (skip if density threshold)
- [ ] `cirrusConfig.coverage = 0.8`: heavy cirrus coverage
- [ ] `cirrusConfig.opacity = 0.1`: barely visible wisps
- [ ] `cirrusConfig.windSpeed = 4.0`: fast jet-stream movement

## Known Risks

1. **Performance budget**: This phase only makes sense if Phase 5 delivered significant savings. If cumulus + temporal is already at 3ms, there's only ~5ms of headroom — and cirrus adds 0.5-1ms. Measure first
2. **Visual clutter**: Two cloud layers can look busy or confusing. The cirrus opacity should default to low (0.3-0.4) so it's subtle
3. **Compositing order**: Blending two semitransparent layers is approximate (not physically correct order-independent transparency). Back-to-front compositing is sufficient for non-overlapping altitude ranges
4. **Cirrus through cumulus**: If the camera is below both layers you may see cirrus through gaps in cumulus. The simple back-to-front blend handles this naturally, but verify it looks correct near cumulus edges where partial transparency meets cirrus
5. **Shadow map complexity**: If cirrus shadows are added, the shadow pass becomes more expensive and the shadow shader needs more complexity. Skip this unless cirrus shadows look obviously wrong

## Rollback Strategy

Cirrus is a fully independent addition with no impact on existing passes:

1. Remove `CirrusCloudRenderer` instantiation from `SkyRenderer`
2. Remove cirrus texture binding from `SkyFinalPass`
3. Remove cirrus blend from `atmosphereFinal.wgsl`
4. Delete `CirrusCloudRenderer.ts` and `cirrusClouds.wgsl`

No existing functionality is modified — the pipeline simply renders one fewer layer.

## Files

| Action            | Path                                                                |
| ----------------- | ------------------------------------------------------------------- |
| Create            | `packages/rewild-renderer/lib/renderers/sky/CirrusCloudRenderer.ts` |
| Create            | `packages/rewild-renderer/lib/shaders/cirrusClouds.wgsl`            |
| Modify            | `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`         |
| Modify            | `packages/rewild-renderer/lib/renderers/sky/SkyFinalPass.ts`        |
| Modify            | `packages/rewild-renderer/lib/shaders/atmosphereFinal.wgsl`         |
| Modify (optional) | `packages/rewild-renderer/lib/renderers/sky/CloudShadowRenderer.ts` |
| Modify (optional) | `packages/rewild-renderer/lib/shaders/cloudShadow.wgsl`             |

## Labels

`enhancement`, `renderer`, `sky`, `clouds`, `optional`
