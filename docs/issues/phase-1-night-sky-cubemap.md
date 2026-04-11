# Phase 1: Night Sky Cubemap + Bug Fixes

## Summary

Cache the expensive procedural night sky (stars, galaxy, dust nebula) into a one-time cubemap, and fix existing bugs in `SkyRenderer`. The night sky currently runs 7+ procedural noise calls per pixel every frame — baking it to a 512³×6 cubemap eliminates this cost entirely. Stars still rotate slowly by transforming the sample direction at runtime.

## Motivation

- `drawNightSky()` in `atmosphere.wgsl` (lines 108-181) uses `proceduralNoise3D()` 7+ times per pixel — this is pure waste since the output is static
- `SkyRenderer.dispose()` never calls `cloudsPass.dispose()` or `atmospherePass.dispose()` — GPU resources leak on resize/teardown
- Dead code: `blurPass.renderTarget` is assigned to `finalPass.cloudsTexture` then immediately overwritten (line 122-123 of SkyRenderer.ts)

## Prerequisites

None. This is the first rendering phase.

## Tasks

### 1.0: Fix existing bugs in `SkyRenderer.ts`

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] **Fix dead assignment** (line 122): Remove `this.finalPass.cloudsTexture = this.blurPass.renderTarget;` — it's immediately overwritten on line 123. The `blurPass` and `denoisePass` are intentionally kept as experimental alternatives (blur vs TAA) but aren't wired into the active render path
- [ ] **Fix missing dispose calls** (lines 232-237): Add `this.cloudsPass.dispose()` and `this.atmospherePass.dispose()` to `dispose()`
- [ ] **Destroy uniform buffer**: Add `this.uniformBuffer?.destroy()` to `dispose()`
- [ ] **Note**: `denoisePass` (blur) and `blurPass` are both kept intentionally — they were being compared as alternative post-processing approaches (blur vs TAA). Neither is currently wired into the render path. Leave them in place for now; they may be revisited once the pipeline stabilizes

### 1.1: Create Night Sky Cubemap Renderer

**New file**: `packages/rewild-renderer/lib/renderers/sky/NightSkyCubemapRenderer.ts`

- [ ] Create class `NightSkyCubemapRenderer` with `init(renderer: Renderer)` and `dispose()` methods
- [ ] Create a 512×512×6 cubemap texture:
  ```typescript
  device.createTexture({
    size: [512, 512, 6],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    dimension: '2d',
  });
  ```
- [ ] Create a render pipeline using the extracted night sky shader (task 1.2)
- [ ] Render all 6 cube faces in `init()`:
  - For each face (+X, -X, +Y, -Y, +Z, -Z), set up the correct view matrix and render a full-screen pass
  - Pass `iTime`, `resolutionX`, `resolutionY` uniforms (use time=0 since rotation is handled at sample time)
- [ ] Expose `cubemapView: GPUTextureView` (created with `dimension: 'cube'`) for consumers
- [ ] This renderer runs **once** at init and never again (unless quality settings change)

### 1.2: Extract night sky shader

**New file**: `packages/rewild-renderer/lib/shaders/nightSky.wgsl`

- [ ] Extract the `drawNightSky()` function (atmosphere.wgsl lines 108-181) and its dependencies into a standalone fragment shader
- [ ] Dependencies to copy/include:
  - `proceduralNoise3D()` from `common.wgsl`
  - `dirToYawPitch()` from `common.wgsl`
  - `hash1()`, `hash2()`, `hash3()` from `common.wgsl`
  - Galaxy constants (`GALAXY_NORMAL`, `GALAXY_CENTER_DIR`) from `atmosphere.wgsl` lines ~82-86
- [ ] Vertex shader: full-screen triangle that outputs a world-space direction per fragment (derived from the cube face being rendered and the fragment's UV)
- [ ] Fragment shader: calls the extracted night sky logic using the world direction, outputs `vec4f(nightSkyColor, 1.0)`
- [ ] Uniform buffer: view matrix (per-face), resolution

### 1.3: Update `atmosphere.wgsl` to sample cubemap

**File**: `packages/rewild-renderer/lib/shaders/atmosphere/atmosphere.wgsl`

- [ ] Add new bindings for the night sky cubemap:
  ```wgsl
  @group(0) @binding(5) var nightSkyCubemap: texture_cube<f32>;
  @group(0) @binding(6) var cubemapSampler: sampler;
  ```
- [ ] In the fragment shader, replace the `drawNightSky(direction, fragCoord)` call with:
  ```wgsl
  // Rotate sample direction for slow star rotation
  let rotationAngle = object.iTime * 0.00001;
  let c = cos(rotationAngle);
  let s = sin(rotationAngle);
  let rotMat = mat3x3<f32>(
    vec3f(c, -s, 0.0),
    vec3f(s, c, 0.0),
    vec3f(0.0, 0.0, 1.0)
  );
  let nightSky = textureSample(nightSkyCubemap, cubemapSampler, rotMat * direction).rgb;
  ```
- [ ] **Remove** the entire `drawNightSky()` function (lines 108-181) from `atmosphere.wgsl`
- [ ] Remove any noise function imports that are now only used by `drawNightSky()` (check if `proceduralNoise3D`, `dirToYawPitch` are used elsewhere in the atmosphere shader — if not, they can be removed from the atmosphere shader bundle)

### 1.4: Update `AtmosphereRenderer.ts` bindings

**File**: `packages/rewild-renderer/lib/renderers/sky/AtmosphereRenderer.ts`

- [ ] Accept `nightSkyCubemap: GPUTexture` as a parameter to `init()`
- [ ] Add two new bind group entries (after the existing 5):
  ```typescript
  { binding: 5, resource: nightSkyCubemap.createView({ dimension: 'cube' }) },
  { binding: 6, resource: renderer.samplerManager.get('linear') },
  ```
- [ ] Update pipeline layout if using explicit layout (currently uses `'auto'` so this should work automatically)

### 1.5: Wire up in `SkyRenderer.ts`

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] Import and instantiate `NightSkyCubemapRenderer` in the constructor
- [ ] In `init()`:
  1. Call `this.nightSkyRenderer.init(renderer)` **before** `this.atmospherePass.init()`
  2. Pass the cubemap to atmosphere: `this.atmospherePass.init(renderer, this.uniformBuffer, this.nightSkyRenderer.cubemap)`
- [ ] In `dispose()`: call `this.nightSkyRenderer.dispose()`

## Acceptance Criteria

- [ ] Night sky looks identical to before (same stars, galaxy, dust patterns, brightness)
- [ ] Stars slowly rotate over time (same rotation speed as current implementation)
- [ ] Atmosphere gradient, sun disk, and fog update dynamically with sun position (not baked)
- [ ] No console errors or GPU validation warnings
- [ ] All GPU resources properly disposed — verify in Chrome DevTools → Performance → GPU memory:
  - Resize window: no memory growth
  - Navigate away and back: no memory growth
- [ ] `dispose()` cleans up clouds, atmosphere, night sky cubemap, uniform buffer
- [ ] Dead `blurPass` assignment removed
- [ ] Memory: cubemap adds ~6 MB (512 × 512 × 6 faces × 4 bytes)

## Performance Validation

Measure with the GPU Performance Monitor (Phase 0) before and after:

- **Expected improvement**: 1-2 ms faster on night pixels (7+ noise calls eliminated)
- **Atmosphere pass** should be measurably cheaper at night
- **No regression** on daytime rendering (cubemap sample is trivially cheap)

## Testing Checklist

- [ ] Daytime: no visual change (night sky not visible)
- [ ] Sunset/sunrise: night sky blends correctly at horizon
- [ ] Nighttime: stars and galaxy visible, same density and color as before
- [ ] Star rotation: stars drift slowly — compare rotation speed to old implementation
- [ ] Resize: no crashes, textures recreated correctly
- [ ] Horizon transition: smooth blend between atmosphere and night sky (check `hemisphereMask` at atmosphere.wgsl line 36)

## Rollback Strategy

If visual issues occur or performance doesn't improve:

1. Keep `drawNightSky()` in the atmosphere shader
2. Delete `NightSkyCubemapRenderer.ts` and `nightSky.wgsl`
3. Revert `atmosphere.wgsl` and `AtmosphereRenderer.ts` binding changes

## Files

| Action | Path                                                                    |
| ------ | ----------------------------------------------------------------------- |
| Modify | `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`             |
| Modify | `packages/rewild-renderer/lib/renderers/sky/AtmosphereRenderer.ts`      |
| Modify | `packages/rewild-renderer/lib/shaders/atmosphere/atmosphere.wgsl`       |
| Create | `packages/rewild-renderer/lib/renderers/sky/NightSkyCubemapRenderer.ts` |
| Create | `packages/rewild-renderer/lib/shaders/nightSky.wgsl`                    |

## Labels

`enhancement`, `renderer`, `sky`, `performance`
