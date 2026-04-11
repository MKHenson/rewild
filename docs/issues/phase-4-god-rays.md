# Phase 4: God Rays

## Summary

Add cheap screen-space god rays (light shafts) that shine through gaps in clouds when looking toward the sun. Uses a radial blur post-process on the cloud transmittance to create the scattering effect. Rendered at half resolution and composited additively into the final image.

## Motivation

God rays are one of the most atmospheric visual effects in outdoor scenes. When the sun is partially occluded by clouds, visible shafts of light extend from gaps — this is called crepuscular rays. The effect dramatically enhances sunrise/sunset scenes, gives volume to the atmosphere, and creates a strong sense of natural light.

The technique used here (screen-space radial blur) is one of the cheapest approaches — it requires no volumetric integration, just repeated texture samples marching toward the sun's screen position.

## Prerequisites

- **Phase 1** completed (bug fixes, pipeline cleanup)
- **Phase 2** completed (cloud rendering produces the transmittance data needed)
- **Phase 3** recommended (altitude fix — god rays should work at any altitude)

## Architecture

```
Cloud Render Pass
    │
    ▼  alpha channel = cloud transmittance (0 = blocked, 1 = clear sky)
┌─────────────────────────┐
│  God Ray Post-Process   │  Half-res (960×540 for 1080p)
│  Radial blur toward     │  24 samples along ray toward sun screen pos
│  sun screen position    │  Output: light shaft intensity per pixel
└─────────────────────────┘
    │
    ▼  additive blend
┌─────────────────────────┐
│  Final Composite        │  scene + clouds + god rays (additive)
└─────────────────────────┘
```

The radial blur technique:

1. Project the sun to screen-space coordinates
2. For each pixel, march along a line from the pixel toward the sun
3. Accumulate cloud transmittance (clear sky) along the march
4. Weight decreases with distance from sun → rays fade outward
5. Multiply by exposure and sun color

This only works when the sun is on-screen or near the edges. When the sun is behind the camera, the pass is skipped entirely.

## Tasks

### 4.1: Create `GodRaysPostProcess`

**New file**: `packages/rewild-renderer/lib/post-processes/GodRaysPostProcess.ts`

- [ ] Create class with configuration:
  ```typescript
  interface GodRayConfig {
    numSamples: number; // 16-32, number of radial blur taps (default: 24)
    density: number; // 0-1, how far rays extend from sun (default: 0.4)
    weight: number; // 0-1, overall brightness multiplier (default: 0.6)
    decay: number; // 0-1, per-step brightness falloff (default: 0.96)
    exposure: number; // 0-5, final intensity (default: 1.2)
    enabled: boolean; // Toggle on/off (default: true)
  }
  ```
- [ ] Create a **half-resolution** render target:
  ```typescript
  const width = Math.floor(canvas.width / 2);
  const height = Math.floor(canvas.height / 2);
  device.createTexture({
    size: [width, height, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  ```
  Half-res is sufficient because god rays are inherently soft/blurry. The bilinear upscale during final composite provides free softening.
- [ ] Create uniform buffer for per-frame data:
  - `sunScreenPos: vec2<f32>` — sun position in UV space (0-1)
  - `density: f32`
  - `weight: f32`
  - `decay: f32`
  - `exposure: f32`
  - `numSamples: f32`
  - `sunColor: vec3<f32>` — tinted by atmosphere (warm at sunset)
- [ ] Create render pipeline using the god rays shader (task 4.2)
- [ ] Create bind group with:
  - Uniform buffer
  - Cloud texture (from `cloudsPass.renderTarget`) — the alpha channel contains transmittance
  - Linear sampler
- [ ] Implement `render(renderer, camera, sunWorldPosition)`:
  1. Project sun world position to screen UV using camera view-projection matrix
  2. Check if sun is in front of camera (clip-space `w > 0`) and within/near screen bounds
  3. If sun is off-screen by more than 30% of screen width, skip rendering (rays won't be visible)
  4. Upload uniforms
  5. Execute render pass
- [ ] Implement `resize(width, height)`: recreate render target at half the new size
- [ ] Implement `dispose()`: destroy texture, uniform buffer

### 4.2: Create god rays shader

**New file**: `packages/rewild-renderer/lib/shaders/godRays.wgsl`

- [ ] Uniform struct:
  ```wgsl
  struct GodRayUniforms {
    sunScreenPos: vec2<f32>,
    density: f32,
    weight: f32,
    decay: f32,
    exposure: f32,
    numSamples: f32,
    _pad: f32,
    sunColor: vec3<f32>,
    _pad2: f32,
  };
  ```
- [ ] Vertex shader: full-screen triangle (same pattern as other post-process passes)
- [ ] Fragment shader:

  ```wgsl
  @fragment
  fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let toSun = uniforms.sunScreenPos - uv;
    let dist = length(toSun);
    let dir = toSun / max(dist, 0.001); // Avoid division by zero at sun center

    let numSamples = i32(uniforms.numSamples);
    let stepSize = uniforms.density / f32(numSamples);

    var illumination = 0.0;
    var currentWeight = 1.0;
    var currentPos = uv;

    for (var i = 0; i < numSamples; i++) {
      currentPos += dir * stepSize;

      // Sample cloud transmittance from the alpha channel
      // transmittance = 1 - alpha: clear sky lets light through
      let cloudSample = textureSample(cloudTexture, linearSampler, currentPos);
      let transmittance = 1.0 - cloudSample.a;

      // Accumulate light from clear-sky regions
      illumination += transmittance * currentWeight;

      // Decay weight along ray
      currentWeight *= uniforms.decay;
    }

    // Normalize and apply exposure
    illumination /= f32(numSamples);
    illumination *= uniforms.exposure * uniforms.weight;

    // Distance falloff — stronger near sun, fades toward edges
    let falloff = smoothstep(1.2, 0.0, dist);
    illumination *= falloff;

    // Tint with sun color
    let rayColor = uniforms.sunColor * illumination;

    return vec4<f32>(rayColor, illumination);
  }
  ```

- [ ] **Important**: The `cloudTexture` sampled here is the cloud render target from `cloudsPass`. Verify that its alpha channel contains meaningful transmittance data (0 = fully occluded, 1 = fully transparent). If the current cloud shader writes alpha differently, adjust the sampling accordingly — this may require checking what `skyRay()` returns in `clouds.wgsl` and how it's written to the render target
- [ ] Out-of-bounds UV reads (from marching off the edge of the screen) should be handled by the sampler's `addressMode` — use `clamp-to-edge` so edge pixels repeat rather than wrapping around

### 4.3: Integrate into sky rendering pipeline

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] Import and instantiate `GodRaysPostProcess` in the constructor
- [ ] In `init()`: initialize god rays pass with the cloud render target texture
  ```typescript
  this.godRaysPass.init(renderer);
  this.godRaysPass.cloudTexture = this.cloudsPass.renderTarget;
  ```
- [ ] In the `render()` pipeline, insert god rays **after bloom but before TAA**:
  ```
  cloudsPass → atmospherePass → bloomPass → godRaysPass → taaPass → finalPass
  ```
  Rationale: god rays should be bloom-free (they're already soft light) and benefit from TAA stabilization
- [ ] In `resize()`: call `this.godRaysPass.resize(width, height)`
- [ ] In `dispose()`: call `this.godRaysPass.dispose()`

### 4.4: Update final composite to include god rays

**File**: `packages/rewild-renderer/lib/shaders/atmosphereFinal.wgsl`
**File**: `packages/rewild-renderer/lib/renderers/sky/SkyFinalPass.ts`

- [ ] Add a new texture binding for the god rays render target
- [ ] In the final composite fragment shader, add god rays with **additive blending**:

  ```wgsl
  // Sample god rays (half-res → bilinear upscale)
  let godRays = textureSample(godRaysTexture, linearSampler, uv);

  // Additive blend — god rays add light, never subtract
  finalColor += godRays.rgb;
  ```

- [ ] The additive blend means god rays can potentially overbright — this is intentional and handled by the existing tone mapping in the final pass. If there's no tone mapping, consider adding a `saturate()` or soft clamp
- [ ] Update `SkyFinalPass` bind group to include the god rays texture

### 4.5: Compute sun color from atmosphere

- [ ] God rays should be tinted by the atmosphere — warm orange at sunset, white at noon, dim red at sunrise:

  ```typescript
  // In SkyRenderer.update() or render()
  const sunElevation = Math.asin(sunDirection.y); // radians above horizon
  const t = Math.max(0, sunElevation / (Math.PI / 2)); // 0 at horizon, 1 at zenith

  // Simple atmospheric tinting
  const sunColor = {
    r: 1.0,
    g: lerp(0.4, 1.0, t), // Less green at low angles
    b: lerp(0.1, 0.9, t), // Much less blue at low angles
  };
  ```

- [ ] Pass `sunColor` to the god rays uniform buffer each frame

### 4.6: Auto-disable logic

- [ ] Disable god rays when:
  - Sun is below the horizon (elevation < -5°): no visible light source
  - Sun is far behind camera (dot product of camera forward and sun direction < -0.3): rays not visible
  - `enabled == false` in config
- [ ] Fade intensity smoothly when sun approaches horizon rather than hard cutoff:
  ```typescript
  const sunDotUp = sunDirection.y;
  const godRayFade = smoothstep(-0.05, 0.1, sunDotUp); // Fade in/out near horizon
  this.godRaysPass.config.weight = this.godRayIntensity * godRayFade;
  ```
- [ ] When disabled, skip the entire render pass (don't just set weight to 0)

### 4.7: Expose runtime controls

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] Add tunable properties:
  - `godRayEnabled: boolean` (default: `true`)
  - `godRayIntensity: number` (default: `1.0`, range 0-3) — master brightness
  - `godRayDensity: number` (default: `0.4`, range 0.1-1.0) — ray length
  - `godRayDecay: number` (default: `0.96`, range 0.8-0.99) — falloff rate
- [ ] These should be updatable at runtime without pipeline recreation

## Acceptance Criteria

- [ ] God rays visible when looking toward the sun through partial cloud cover
- [ ] Rays emanate from the sun's screen position and spread outward
- [ ] Clear sky gaps in clouds produce visible light shafts
- [ ] Dense clouds fully block rays (no light leaking through opaque areas)
- [ ] Ray color matches atmospheric tinting (warm at sunset, white at noon)
- [ ] Rays fade smoothly when:
  - Sun drops below horizon
  - Camera turns away from sun
  - Sun moves behind dense cloud cover
- [ ] No rays when sun is behind the camera (entirely skipped)
- [ ] No visible banding in the rays (24 samples should be sufficient)
- [ ] Performance: < 0.5ms at half resolution (960×540) with 24 samples
- [ ] Resize: render target recreated correctly
- [ ] `dispose()` cleans up all GPU resources

## Performance Budget

| Component                                  | Budget         |
| ------------------------------------------ | -------------- |
| God ray render pass (half-res, 24 samples) | < 0.5 ms       |
| Final composite (one extra texture read)   | < 0.05 ms      |
| Sun projection (CPU)                       | Negligible     |
| Memory (half-res RGBA8)                    | ~2 MB at 1080p |

Performance math: 960 × 540 = 518k pixels × 24 samples = 12.4M texture lookups. At ~10 GT/s on RTX 3080, this is ~0.001ms for texture reads alone. The bottleneck will be ALU and memory bandwidth, but still well under 0.5ms.

## Testing Checklist

- [ ] **Noon, partly cloudy**: soft rays visible through cloud gaps
- [ ] **Sunset, partly cloudy**: warm orange rays with long reach
- [ ] **Sunrise, partly cloudy**: similar to sunset, different sun position
- [ ] **Overcast (cloudiness = 0.9)**: minimal/no rays (dense cover blocks light)
- [ ] **Clear sky (cloudiness = 0)**: subtle uniform glow around sun (no occlusion to create shafts)
- [ ] **Night**: no god rays (auto-disabled)
- [ ] **Camera facing away from sun**: god rays pass skipped, no artifacts
- [ ] **Camera rotating toward/away from sun**: smooth fade in/out
- [ ] **Sun at screen edge**: rays still visible, extend off-screen correctly
- [ ] **Inside clouds (Phase 3)**: god rays should be dimmed or disabled (fog obscures them)
- [ ] **Above clouds looking down**: god rays not applicable (sun is above, not through clouds)

## Quality Tuning Guide

For your future self — here's how each parameter affects the look:

| Parameter    | Low value                                  | High value                     |
| ------------ | ------------------------------------------ | ------------------------------ |
| `numSamples` | 16: slightly noisy/banded                  | 32: smoother but 2x cost       |
| `density`    | 0.2: short, subtle rays                    | 0.8: long, dramatic rays       |
| `decay`      | 0.85: sharp falloff, concentrated near sun | 0.98: gradual, rays extend far |
| `weight`     | 0.3: subtle                                | 1.0: prominent                 |
| `exposure`   | 0.5: dim                                   | 2.0: bright, may overblow      |

Start with: `numSamples=24, density=0.4, weight=0.6, decay=0.96, exposure=1.2`

## Debugging

- [ ] Add a debug mode that renders the god ray texture as a full-screen overlay (without the scene) to inspect the raw ray pattern
- [ ] Add a debug mode that shows the sun screen position as a dot on screen
- [ ] Log when god rays are auto-disabled and why (below horizon, behind camera, etc.)

## Known Risks

1. **Cloud alpha channel format**: The god ray shader assumes the cloud render target's alpha channel contains transmittance data. If `skyRay()` returns `vec4(color, 1.0 - transmittance)` correctly this works; if not, the sampling must be adjusted. Verify the alpha output of the cloud shader before starting
2. **Screen-space artifacts**: Radial blur is a screen-space technique — it can't create rays for clouds that are off-screen. This is a known limitation of the approach and is generally acceptable (volumetric ray marching would fix this but at 10x the cost)
3. **Banding with low sample count**: If 24 samples produce visible banding, add dithering:
   ```wgsl
   // Add per-pixel random offset to ray starting position
   let noise = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
   currentPos += dir * stepSize * noise;
   ```
4. **Interaction with bloom**: If bloom is applied before god rays, the bloom pass may already produce a sun glow that competes with god rays. The pipeline order (bloom → god rays → TAA) should handle this, but watch for over-brightening around the sun

## Performance Fallbacks

If god rays exceed the 0.5ms budget:

1. Reduce samples: 24 → 16 (most impactful)
2. Reduce resolution: half-res → quarter-res
3. Only render when sun is within screen center (80% of screen area)
4. Skip every other frame and reuse the previous result
5. Disable entirely via toggle

## Rollback Strategy

God rays are an additive post-process with no impact on other passes. To revert:

1. Remove `GodRaysPostProcess` instantiation from `SkyRenderer`
2. Remove god rays texture binding from `SkyFinalPass`
3. Remove additive blend from `atmosphereFinal.wgsl`
4. Delete `GodRaysPostProcess.ts` and `godRays.wgsl`

No other passes are affected — the pipeline simply skips a step.

## Files

| Action | Path                                                                |
| ------ | ------------------------------------------------------------------- |
| Create | `packages/rewild-renderer/lib/post-processes/GodRaysPostProcess.ts` |
| Create | `packages/rewild-renderer/lib/shaders/godRays.wgsl`                 |
| Modify | `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`         |
| Modify | `packages/rewild-renderer/lib/renderers/sky/SkyFinalPass.ts`        |
| Modify | `packages/rewild-renderer/lib/shaders/atmosphereFinal.wgsl`         |

## Labels

`enhancement`, `renderer`, `sky`, `post-processing`
