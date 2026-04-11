# Phase 2: Cloud Shadows on Terrain

## Summary

Render cloud density from the sun's perspective into a 2D shadow map texture. Terrain and object shaders sample this map to apply soft, animated cloud shadows. The shadow map updates every N frames to amortize cost.

## Motivation

Clouds currently float in the sky but cast no shadows on the ground. Cloud shadows are one of the most visually impactful atmospheric effects — they sell the scale of the world, give depth to terrain, and change dynamically with wind.

## Prerequisites

- **Phase 1** completed (bug fixes, dispose cleanup)
- Phase 0 (GPU Performance Monitor) recommended for validation

## Architecture

```
Sun (directional light)
    │
    ▼  orthographic projection ALONG SUN DIRECTION
┌─────────────────────────┐
│   Cloud Shadow Map      │  1024×1024, r16float
│   (density per texel)   │  Updated every 2-4 frames
└─────────────────────────┘
    │
    ▼  sampled by terrain/object shaders
┌─────────────────────────┐
│   Terrain Fragment      │  shadowUV = project worldPos into sun's view
│   lighting *= shadow    │  shadow = 1.0 - density * intensity
└─────────────────────────┘
```

The shadow map is a **sun-aligned density accumulation** of the cloud layer. Rays march through the cloud volume along the **sun direction** (not straight down). This is critical for a day/night cycle — at sunrise/sunset the sun is near the horizon, so shadows stretch far across the landscape, offset from the cloud position. Vertical rays would incorrectly place shadows directly beneath clouds at all times of day.

Terrain shaders project world positions into the sun's orthographic view space to look up shadow density.

### Low Sun Angle Handling

When the sun is below ~10° elevation, shadow rays travel extremely long horizontal distances through the cloud layer, requiring many more samples for accuracy. At these angles ambient light dominates and distinct cloud shadows are barely visible in reality. **Skip shadow map updates when sun elevation < 10°** and fade shadow intensity to zero between 10°–15° for a smooth transition.

## Tasks

### 2.1: Create `CloudShadowRenderer`

**New file**: `packages/rewild-renderer/lib/renderers/sky/CloudShadowRenderer.ts`

- [ ] Create class with configuration:
  ```typescript
  interface CloudShadowConfig {
    resolution: number; // 1024 (default) or 2048
    worldSize: number; // Coverage in world units (5000 = 5km radius)
    updateFrequency: number; // Update every N frames (2 = default)
    shadowIntensity: number; // 0-1, how dark shadows are (0.6 default)
  }
  ```
- [ ] Create shadow map texture:
  ```typescript
  device.createTexture({
    size: [resolution, resolution, 1],
    format: 'r16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  ```
- [ ] Create uniform buffer for shadow-specific data:
  - `sunDirection: vec3<f32>` — light direction for ray marching
  - `sunViewMatrix: mat4x4<f32>` — orthographic view matrix aligned to sun direction
  - `sunProjMatrix: mat4x4<f32>` — orthographic projection covering `worldSize`
  - `worldSize: f32` — coverage area
  - `shadowCenter: vec3<f32>` — center of shadow volume (follows camera, in sun-view space)
  - `cloudiness: f32`, `windiness: f32`, `iTime: f32` — shared cloud params
  - `sunElevation: f32` — used for low-angle fade
- [ ] Build sun-aligned orthographic projection:
  - View matrix: look-at from sun direction, centered on camera XZ
  - Projection: orthographic covering `worldSize × worldSize` area perpendicular to sun direction
  - The projection volume must fully contain the cloud layer (CLOUD_START to CLOUD_START+CLOUD_HEIGHT)
- [ ] Create render pipeline using the cloud shadow shader (task 2.2)
- [ ] Implement `shouldUpdate()`: returns `true` every N frames **and** sun elevation > 10° (skip at low angles where shadows are negligible)
- [ ] Implement `render(encoder, camera, sunDirection)`:
  1. Skip if `!shouldUpdate()`
  2. Update shadow center to camera XZ position (snapped to texel grid to avoid shimmer)
  3. Upload uniforms
  4. Execute render pass — full-screen quad, outputs density per texel
- [ ] Implement `dispose()`: destroy texture, uniform buffer, pipeline
- [ ] Expose `shadowMap: GPUTexture` and `shadowCenter: vec2` for consumers

### 2.2: Create cloud shadow shader

**New file**: `packages/rewild-renderer/lib/shaders/cloudShadow.wgsl`

- [ ] Import shared cloud functions: `clouds()` from `clouds.wgsl`, `fbm()` from `common.wgsl`, constants from `constants.wgsl`
  - Reuse the existing `clouds()` function logic or include it via the same shared shader includes used by `CloudsRenderer`
- [ ] Vertex shader: full-screen quad, output world XZ position based on UV and shadow config (center + worldSize)
- [ ] Fragment shader:

  ```wgsl
  @fragment
  fn fs(@location(0) worldPos: vec3<f32>) -> @location(0) f32 {
    // Ray marches along the SUN DIRECTION through the cloud layer.
    // worldPos is in world space, reconstructed from the sun's
    // orthographic view (each texel = a column through the cloud layer
    // aligned to the sun direction).

    let sunDir = normalize(uniforms.sunDirection);  // Points toward sun
    let rayDir = -sunDir;  // March away from sun (into shadow)

    // Find entry/exit of ray through cloud layer sphere shell
    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let tInner = intersectSphere(worldPos, rayDir, earthCenter, EARTH_RADIUS + CLOUD_START);
    let tOuter = intersectSphere(worldPos, rayDir, earthCenter, EARTH_RADIUS + CLOUD_START + CLOUD_HEIGHT);

    // Determine ray segment through cloud volume
    let tStart = max(0.0, min(tInner, tOuter));
    let tEnd = max(tInner, tOuter);
    if (tStart >= tEnd) { return 0.0; }  // No intersection

    let rayLength = tEnd - tStart;
    let numSamples = 32;  // Fewer than main clouds (80)
    let stepSize = rayLength / f32(numSamples);

    var totalDensity = 0.0;
    for (var i = 0; i < numSamples; i++) {
      let p = worldPos + rayDir * (tStart + f32(i) * stepSize);
      let result = clouds(p);  // Reuse existing density function
      totalDensity += result.density * stepSize;
    }

    return saturate(totalDensity * 0.1);  // Normalize to 0-1
  }
  ```

- [ ] **Important**: Because rays are sun-aligned (not vertical), the ray path through the cloud layer is longer at low sun angles. The 32-sample count is sufficient for sun elevations > 15°. At grazing angles the renderer skips updates entirely (see task 2.1 `shouldUpdate`).
- [ ] The shader must use the **same** `clouds()` density function, wind movement, and noise as the main cloud renderer so shadows align with visible clouds
- [ ] Ensure `iTime`, `cloudiness`, `windiness` uniforms match the main cloud pass

### 2.3: Wire into `SkyRenderer`

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] Import and instantiate `CloudShadowRenderer` in constructor
- [ ] In `init()`: call `this.cloudShadowRenderer.init(renderer, ...)`
  - Pass the shared uniform buffer or create a dedicated one for shadow-specific params
- [ ] In `render()`: call shadow renderer **before** the main cloud/atmosphere passes:
  ```typescript
  // Render shadow map (skips internally if not this frame's turn)
  this.cloudShadowRenderer.render(commandEncoder, camera, sunDirection);
  ```
- [ ] In `dispose()`: call `this.cloudShadowRenderer.dispose()`

### 2.4: Expose shadow map to the material system

**File**: `packages/rewild-renderer/lib/Renderer.ts`

- [ ] Add property: `cloudShadowMap: GPUTexture | null = null`
- [ ] Add property: `cloudShadowSunViewProjMatrix: Float32Array` — the sun's orthographic view-projection matrix used to render the shadow map
- [ ] Add property: `cloudShadowIntensity: number = 0.6`
- [ ] Add property: `cloudShadowSunElevationFade: number = 1.0` — CPU-computed fade (0 when sun < 10°, 1 when > 15°)
- [ ] After sky render completes, copy references from `SkyRenderer`:
  ```typescript
  this.cloudShadowMap =
    this.atmosphere.skyRenderer.cloudShadowRenderer.shadowMap;
  this.cloudShadowSunViewProjMatrix =
    this.atmosphere.skyRenderer.cloudShadowRenderer.sunViewProjMatrix;
  this.cloudShadowIntensity =
    this.atmosphere.skyRenderer.cloudShadowRenderer.config.shadowIntensity;
  this.cloudShadowSunElevationFade =
    this.atmosphere.skyRenderer.cloudShadowRenderer.sunElevationFade;
  ```
- [ ] These are read by any material that wants cloud shadows

### 2.5: Create `sampleCloudShadow()` WGSL utility

**New file**: `packages/rewild-renderer/lib/shaders/cloudShadowSample.wgsl`

- [ ] Create a reusable WGSL function that any material can include:

  ```wgsl
  fn sampleCloudShadow(
    shadowMap: texture_2d<f32>,
    shadowSampler: sampler,
    worldPos: vec3f,
    sunViewProjMatrix: mat4x4<f32>,  // Projects world pos into sun's view
    intensity: f32,
    sunElevationFade: f32            // 0 at low sun, 1 at high sun
  ) -> f32 {
    // Project world position into sun's orthographic view space
    let shadowClip = sunViewProjMatrix * vec4f(worldPos, 1.0);
    let uv = shadowClip.xy * 0.5 + 0.5;  // NDC → UV [0,1]

    // Out of bounds check
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) {
      return 1.0;  // No shadow outside coverage
    }

    let density = textureSample(shadowMap, shadowSampler, uv).r;

    // 0 = full shadow, 1 = no shadow
    // Never fully black — ambient light always present
    let shadowFactor = mix(1.0, 0.3, density * intensity);

    // Fade out at low sun angles (shadows become negligible)
    return mix(1.0, shadowFactor, sunElevationFade);
  }
  ```

- [ ] Edge fade: shadows should fade to `1.0` near the edges of the coverage area to avoid hard cutoffs:
  ```wgsl
  let edgeFade = smoothstep(0.0, 0.05, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y)));
  return mix(1.0, shadowFactor, edgeFade);
  ```
- [ ] The `sunElevationFade` uniform should be computed on the CPU:
  ```typescript
  // sunElevation = angle in radians above horizon
  const sunElevationFade = smoothstep(10 * DEG2RAD, 15 * DEG2RAD, sunElevation);
  ```
  This smoothly fades shadows out between 10°-15° sun elevation, avoiding a hard on/off transition.

### 2.6: Integrate into terrain material (proof of concept)

- [ ] Identify the primary terrain/ground material shader used in the project
- [ ] Add bind group entries for the cloud shadow map texture and sampler
- [ ] Add uniform entries for `sunViewProjMatrix`, `shadowIntensity`, `sunElevationFade`
- [ ] In the fragment shader's lighting calculation, multiply diffuse lighting by `sampleCloudShadow(...)`:
  ```wgsl
  let cloudShadow = sampleCloudShadow(cloudShadowMap, shadowSampler, worldPos, sunViewProjMatrix, shadowIntensity, sunElevationFade);
  lighting.diffuse *= cloudShadow;
  ```
- [ ] If no terrain material exists yet, demonstrate the integration in the `atmosphereFinal.wgsl` fog calculation as a simpler proof of concept

### 2.7: Add runtime controls

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] Expose shadow settings on `SkyRenderer`:
  - `cloudShadowEnabled: boolean` (default `true`)
  - `cloudShadowIntensity: number` (default `0.6`, range 0-1)
  - `cloudShadowResolution: number` (default `1024`)
  - `cloudShadowWorldSize: number` (default `5000`)
  - `cloudShadowUpdateFrequency: number` (default `2`)
- [ ] Shadow map updates should be skippable when `cloudShadowEnabled = false`

## Acceptance Criteria

- [ ] Soft cloud shadows visible on terrain/ground when looking down from above
- [ ] Shadows move over time matching cloud wind animation
- [ ] Shadow positions align with visible clouds (same density function, same wind)
- [ ] Shadow intensity controlled by `cloudiness` parameter (clear sky = no shadows)
- [ ] Shadows fade smoothly at the edges of the coverage area (no hard rectangle cutoff)
- [ ] Shadow map updates every N frames without visible popping or flickering
- [ ] Performance: shadow map render < 0.5ms per update (amortized < 0.25ms/frame at freq=2)
- [ ] Memory: shadow map = 2 MB (1024 × 1024 × 2 bytes r16float)
- [ ] `dispose()` properly destroys shadow map texture and buffers
- [ ] Toggling `cloudShadowEnabled = false` skips all shadow work

## Performance Budget

| Component                             | Budget                          |
| ------------------------------------- | ------------------------------- |
| Shadow map render (1024², 32 samples) | < 0.5 ms per update             |
| Amortized per frame (update freq = 2) | < 0.25 ms                       |
| Shadow sampling in terrain shader     | < 0.05 ms (single texture read) |
| Memory                                | ~2 MB                           |

## Testing Checklist

- [ ] Clear sky (cloudiness = 0): no shadows on terrain
- [ ] Overcast (cloudiness = 0.9): large, connected shadow areas
- [ ] Partly cloudy (cloudiness = 0.5): distinct cloud shadow patches
- [ ] Windy (windiness = 1.0): shadows move visibly faster
- [ ] Camera movement: shadow center follows camera, no jitter
- [ ] Sunrise/sunset (sun at 20°): shadows stretch far from cloud positions (sun-aligned projection)
- [ ] Low sun (sun at 5°): shadow map updates skipped, intensity faded to zero
- [ ] Sun crossing 10°-15° threshold: shadows fade in/out smoothly, no popping
- [ ] Resize window: shadow map recreated correctly
- [ ] Performance: measure with GPU Performance Monitor (Phase 0)

## Debugging

Add a debug visualization toggle to render the shadow map as a screen overlay:

```typescript
// Press 'K' or expose a debug flag
if (debugCloudShadows) {
  // Render shadow map texture as a small quad in corner of screen
  // Shows: white = no cloud, dark = dense cloud
}
```

## Performance Fallbacks

If the shadow pass is too expensive:

1. Reduce resolution: 1024 → 512 (4x fewer texels)
2. Increase update frequency: 2 → 4 frames
3. Reduce samples: 32 → 16
4. Reduce world coverage: 5000 → 3000 (smaller area)
5. Disable entirely via toggle

## Rollback Strategy

Cloud shadows are additive — they only modify existing material shaders. To revert:

1. Remove `cloudShadow` multiplication from terrain shader
2. Delete `CloudShadowRenderer.ts` and `cloudShadow.wgsl`
3. Remove shadow map properties from `Renderer.ts`
4. Remove instantiation from `SkyRenderer.ts`

## Files

| Action | Path                                                                |
| ------ | ------------------------------------------------------------------- |
| Create | `packages/rewild-renderer/lib/renderers/sky/CloudShadowRenderer.ts` |
| Create | `packages/rewild-renderer/lib/shaders/cloudShadow.wgsl`             |
| Create | `packages/rewild-renderer/lib/shaders/cloudShadowSample.wgsl`       |
| Modify | `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`         |
| Modify | `packages/rewild-renderer/lib/Renderer.ts`                          |
| Modify | Terrain/ground material shader (TBD based on current materials)     |

## Labels

`enhancement`, `renderer`, `sky`, `lighting`
