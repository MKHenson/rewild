# Improved Atmospheric Rendering

## Overview

This document outlines the implementation plan for enhanced atmospheric rendering in the Rewild engine. The goal is to achieve realistic, performant sky and cloud rendering that supports flying through clouds, volumetric shadows, and god rays while maintaining 120 FPS on high-end hardware (RTX 3080+) in Chrome/WebGPU.

## Requirements Summary

1. ✅ Fly through clouds at any altitude
2. ✅ Clouds cast soft shadows on terrain/objects
3. ✅ God rays with light shafts through cloud gaps (cheap implementation)
4. ✅ Control range: Clear/wispy → Dark/stormy volumetric clouds
5. ✅ Maintain 120 FPS target on RTX 3080+ hardware
6. ✅ Support multiple cloud layers (low cumulus + high cirrus) if performance allows
7. ✅ Keep memory footprint reasonable (< 200MB for sky system)

## Current System Analysis

### Architecture

- **SkyRenderer** - Main orchestrator
- **CloudsRenderer** - Volumetric raymarched clouds (rgba16float @ 0.8x, 80 samples)
- **AtmosphereRenderer** - Sky gradient + night sky (rgba8unorm @ 1x)
- **Post-processing**: Bloom → TAA → FinalComp

### Critical Issues to Fix

1. **Duplicate texture assignment** (SkyRenderer.ts:122-124) - blurPass overwritten
2. **Missing dispose calls** - CloudsRenderer and AtmosphereRenderer not disposed
3. **Inefficient resize handling** - Full re-init on resize instead of texture recreation
4. **Altitude limitation** - Sphere intersection breaks when camera above clouds
5. **Separate command buffer submission** - Extra GPU sync points

### Performance Characteristics

- Cloud raymarching: 80 samples per ray, expensive FBM noise
- Night sky: 7+ procedural noise calls per pixel
- No temporal reuse or caching
- Currently meeting 120 FPS on test hardware

---

## Implementation Phases

Each phase must be validated before proceeding to the next. After each phase, verify:

- Visual correctness (no artifacts, proper blending)
- Performance target maintained (120 FPS)
- Controls work as expected
- No memory leaks or GPU warnings

---

## Phase 0: Cleanup & Baseline (2-3 hours)

**Goal**: Fix bugs, establish performance baseline, implement quick wins.

### Tasks

#### 0.1: Fix Critical Bugs

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

**Changes**:

```typescript
// Line 122-124: Fix duplicate assignment
this.finalPass.atmosphereTexture = this.atmospherePass.renderTarget;
this.finalPass.cloudsTexture = this.taaPass.renderTarget;
// Remove: this.blurPass initialization (line 71)
// Remove: blurPass from dispose (line 234)

// Line 232-238: Add missing dispose calls
dispose() {
  this.cloudsPass.dispose();      // ADD THIS
  this.atmospherePass.dispose();  // ADD THIS
  this.taaPass.dispose();
  this.bloomPass.dispose();
  this.denoisePass.dispose();
  this.finalPass.dispose();

  if (this.uniformBuffer) {
    this.uniformBuffer.destroy();
  }
}
```

#### 0.2: Profile Current Performance

Create a performance monitoring system:

**New File**: `packages/rewild-renderer/lib/utils/PerformanceMonitor.ts`

```typescript
export class PerformanceMonitor {
  private queries: Map<string, GPUQuerySet>;
  private resolveBuffers: Map<string, GPUBuffer>;

  beginQuery(encoder: GPUCommandEncoder, label: string): void;
  endQuery(encoder: GPUCommandEncoder, label: string): void;
  async getResults(): Promise<Map<string, number>>;
}
```

**Integrate into SkyRenderer**:

```typescript
// Measure each pass:
// - Cloud rendering
// - Atmosphere rendering
// - Bloom
// - TAA
// - Final composite
// Log total sky system time
```

#### 0.3: Optimize Uniform Buffer Alignment

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts:82-100`

```typescript
// Change alignment from 256 to 16 bytes
const uniformBufferSize =
  16 * 4 + // modelMatrix (64)
  16 * 4 + // projectionMatrix (64)
  16 * 4 + // modelViewMatrix (64)
  3 * 4 + // cameraPosition (12)
  4 + // resolutionScale (4)
  4 * 4 + // sunPosition (16)
  4 * 4 + // up (16)
  4 + // iTime (4)
  4 + // resolutionX (4)
  4 + // resolutionY (4)
  4 + // cloudiness (4)
  4 + // foginess (4)
  4; // windiness (4)
// Total: ~260 bytes

// Use 16-byte alignment instead of 256
const alignedUniformBufferSize = Math.ceil(uniformBufferSize / 16) * 16;
```

**Savings**: ~150 bytes per frame = negligible, but cleaner.

### Validation Criteria

- [ ] No console errors or warnings
- [ ] All resources properly disposed (check Chrome DevTools GPU memory)
- [ ] Performance baseline documented (ms per pass)
- [ ] System still renders identically to before

---

## Phase 1: Night Sky Cubemap (4-6 hours)

**Goal**: Cache expensive night sky rendering to cubemap for 50-70% speedup on night pixels.

### Architecture Decision

**Cache**: Night sky only (stars, galaxy, dust)
**Keep Dynamic**: Atmosphere gradient, sun disk, fog calculations

**Rationale**: Night sky is static and expensive (7+ noise calls/pixel). Atmosphere is cheap (20 ALU ops) and needed for fog/cloud lighting.

### Tasks

#### 1.1: Create Night Sky Cubemap Renderer

**New File**: `packages/rewild-renderer/lib/renderers/sky/NightSkyCubemapRenderer.ts`

```typescript
export class NightSkyCubemapRenderer {
  cubemap: GPUTexture;
  pipeline: GPURenderPipeline;

  /**
   * Renders the night sky to a 512x512x6 cubemap
   * Called once at initialization
   */
  init(renderer: Renderer): void {
    // Create cubemap texture (512x512, RGBA8, 6 faces)
    this.cubemap = device.createTexture({
      size: [512, 512, 6],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      dimension: '2d',
    });

    // Create shader module from existing drawNightSky() code
    // Extract from atmosphere.wgsl:124-207

    // Render each of 6 cube faces
    this.renderAllFaces(renderer);
  }

  private renderAllFaces(renderer: Renderer): void {
    // For each face: +X, -X, +Y, -Y, +Z, -Z
    // Set up view matrix looking at that face
    // Render full-screen quad with night sky shader
  }
}
```

#### 1.2: Extract Night Sky Shader

**New File**: `packages/rewild-renderer/lib/shaders/nightSky.wgsl`

Extract the `drawNightSky()` function from `atmosphere.wgsl` into standalone shader:

```wgsl
struct Uniforms {
  viewProjectionMatrix: mat4x4<f32>,
  iTime: f32,
  resolutionX: f32,
  resolutionY: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VSOutput {
  // Full-screen triangle
  // Output clip-space position + world direction
}

@fragment
fn fs(@location(0) worldDir: vec3f) -> @location(0) vec4f {
  // Existing drawNightSky() code
  // Returns vec4f(stars + galaxy + dust, 1.0)
}
```

#### 1.3: Update Atmosphere Shader to Sample Cubemap

**File**: `packages/rewild-renderer/lib/shaders/atmosphere/atmosphere.wgsl`

```wgsl
// ADD: New binding for cubemap
@group(0) @binding(5)
var nightSkyCubemap: texture_cube<f32>;

@group(0) @binding(6)
var cubemapSampler: sampler;

@fragment
fn fs(...) -> OutputStruct {
  let direction = normalize(vWorldPosition - object.cameraPosition);

  // REPLACE drawNightSky() call with:
  // 1. Rotate direction for time-based star movement
  let rotationAngle = object.iTime * 0.00001;
  let cosAngle = cos(rotationAngle);
  let sinAngle = sin(rotationAngle);
  let rotationMatrix = mat3x3<f32>(
    vec3f(cosAngle, 0.0, -sinAngle),
    vec3f(0.0, 1.0, 0.0),
    vec3f(sinAngle, 0.0, cosAngle)
  );
  let rotatedDir = rotationMatrix * direction;

  // 2. Sample cubemap
  let nightSky = textureSample(nightSkyCubemap, cubemapSampler, rotatedDir).rgb;

  // Continue with existing atmosphere blending...
  let atmosphereWithSunAndClouds = drawCloudsAndSky(direction, object.cameraPosition, vSunDirection, nightSky);
  // ...
}

// REMOVE: drawNightSky() function entirely (lines 124-207)
```

#### 1.4: Integrate into SkyRenderer

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

```typescript
import { NightSkyCubemapRenderer } from './NightSkyCubemapRenderer';

export class SkyRenderer {
  nightSkyRenderer: NightSkyCubemapRenderer;

  constructor(parent: Transform) {
    // ... existing code ...
    this.nightSkyRenderer = new NightSkyCubemapRenderer();
  }

  init(renderer: Renderer): void {
    // ... existing code ...

    // Render night sky cubemap (once)
    this.nightSkyRenderer.init(renderer);

    // Update atmosphere pass to use cubemap
    this.atmospherePass.init(
      renderer,
      this.uniformBuffer,
      this.nightSkyRenderer.cubemap
    );
  }
}
```

#### 1.5: Update AtmosphereRenderer Bindings

**File**: `packages/rewild-renderer/lib/renderers/sky/AtmosphereRenderer.ts`

```typescript
init(renderer: Renderer, uniformBuffer: GPUBuffer, nightSkyCubemap: GPUTexture) {
  // ... existing code ...

  this.bindGroup = device.createBindGroup({
    label: 'bind group for atmosphere & nightsky',
    layout: this.pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: renderer.samplerManager.get('linear') },
      { binding: 2, resource: renderer.textureManager.get('rgba-noise-256').gpuTexture.createView() },
      { binding: 3, resource: renderer.depthTexture.createView() },
      { binding: 4, resource: renderer.samplerManager.get('depth-comparison') },
      // ADD: Night sky cubemap
      { binding: 5, resource: nightSkyCubemap.createView({ dimension: 'cube' }) },
      { binding: 6, resource: renderer.samplerManager.get('linear') },
    ],
  });
}
```

### Validation Criteria

- [ ] Night sky looks identical to before (same stars, galaxy, dust)
- [ ] Stars slowly rotate over time
- [ ] Atmosphere gradient still updates with sun position
- [ ] Performance improvement: 1-2ms faster when night sky visible
- [ ] Memory: +48MB for cubemap (512×512×6×4 bytes)

### Rollback Strategy

If performance doesn't improve or visual issues occur:

1. Keep `drawNightSky()` function in shader
2. Delete `NightSkyCubemapRenderer`
3. Revert atmosphere.wgsl changes

---

## Phase 2: Cloud Shadows on Terrain (8-12 hours)

**Goal**: Render cloud density to shadow map, apply soft shadows to terrain/objects.

### Architecture Decision

Use **Cascaded Shadow Map** approach adapted for clouds:

- Render clouds from sun's perspective to 2D texture
- Store accumulated density (not binary shadow)
- Sample in terrain/object shaders
- Update every 2-4 frames for performance

### Tasks

#### 2.1: Create Cloud Shadow Map Renderer

**New File**: `packages/rewild-renderer/lib/renderers/sky/CloudShadowRenderer.ts`

```typescript
export interface CloudShadowConfig {
  resolution: number; // Shadow map size (1024 or 2048)
  worldSize: number; // Coverage in meters (e.g., 5000m)
  updateFrequency: number; // Update every N frames (2-4)
}

export class CloudShadowRenderer {
  shadowMap: GPUTexture; // Single-channel density map
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  frameCounter: number = 0;
  config: CloudShadowConfig;

  constructor(
    config: CloudShadowConfig = {
      resolution: 1024,
      worldSize: 5000,
      updateFrequency: 2,
    }
  ) {
    this.config = config;
  }

  init(renderer: Renderer, cloudsUniformBuffer: GPUBuffer): void {
    const { device } = renderer;
    const { resolution } = this.config;

    // Create shadow map texture (top-down view of clouds)
    this.shadowMap = device.createTexture({
      size: [resolution, resolution, 1],
      format: 'r16float', // Single channel, half precision
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Create orthographic projection from sun's perspective
    // Looking down at terrain, covering worldSize × worldSize area

    // Shader: Modified clouds.wgsl that outputs accumulated density
  }

  shouldUpdate(): boolean {
    this.frameCounter++;
    return this.frameCounter % this.config.updateFrequency === 0;
  }

  render(
    encoder: GPUCommandEncoder,
    camera: Camera,
    sunDirection: Vector3
  ): void {
    if (!this.shouldUpdate()) return;

    // Position shadow camera above terrain, looking down
    // Aligned with sun direction

    // Raymarch clouds but output total density instead of color
  }
}
```

#### 2.2: Create Cloud Shadow Shader

**New File**: `packages/rewild-renderer/lib/shaders/cloudShadow.wgsl`

```wgsl
// Simplified version of clouds.wgsl that only calculates density
// No lighting, scattering, or color calculations

struct Uniforms {
  viewProjectionMatrix: mat4x4<f32>,
  sunPosition: vec3<f32>,
  cloudiness: f32,
  windiness: f32,
  iTime: f32,
  worldSize: f32,
};

@vertex
fn vs(@location(0) position: vec3f) -> VSOutput {
  // Standard vertex shader
}

@fragment
fn fs(@location(0) worldPos: vec3f) -> @location(0) f32 {
  // Cast ray downward from this XZ position
  // Accumulate cloud density along vertical ray

  let rayOrigin = worldPos + vec3f(0.0, CLOUD_START + CLOUD_HEIGHT, 0.0);
  let rayDir = vec3f(0.0, -1.0, 0.0);

  var totalDensity = 0.0;
  let numSamples = 32;  // Fewer samples than main cloud render
  let stepSize = CLOUD_HEIGHT / f32(numSamples);

  for (var i = 0; i < numSamples; i++) {
    let p = rayOrigin + rayDir * f32(i) * stepSize;
    let cloudResult = clouds(p);
    totalDensity += cloudResult.density * stepSize;
  }

  // Normalize to 0-1 range
  return saturate(totalDensity * 0.1);
}
```

#### 2.3: Integrate Shadow Map into Renderer

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

```typescript
import { CloudShadowRenderer } from './CloudShadowRenderer';

export class SkyRenderer {
  cloudShadowRenderer: CloudShadowRenderer;

  constructor(parent: Transform) {
    // ... existing code ...
    this.cloudShadowRenderer = new CloudShadowRenderer({
      resolution: 1024,
      worldSize: 5000,  // 5km coverage
      updateFrequency: 2,
    });
  }

  init(renderer: Renderer): void {
    // ... existing code ...
    this.cloudShadowRenderer.init(renderer, this.uniformBuffer);
  }

  render(...): void {
    // ... existing code ...

    // Render shadow map BEFORE main passes
    this.cloudShadowRenderer.render(commandEncoder, camera, this.sun.transform.forward);

    // Continue with clouds, atmosphere, etc.
  }
}
```

#### 2.4: Expose Shadow Map to Material System

**File**: `packages/rewild-renderer/lib/Renderer.ts`

Add cloud shadow map as shared resource:

```typescript
export class Renderer {
  cloudShadowMap: GPUTexture | null = null;

  // Make accessible to all materials
  getCloudShadowMap(): GPUTexture | null {
    return this.cloudShadowMap;
  }
}
```

Update after sky render:

```typescript
// In main render loop, after sky.render():
this.cloudShadowMap = this.atmosphere.skyRenderer.cloudShadowRenderer.shadowMap;
```

#### 2.5: Update Materials to Sample Shadow Map

**Example**: Standard terrain/object material

```wgsl
// Add to material bindings:
@group(2) @binding(10) var cloudShadowMap: texture_2d<f32>;
@group(2) @binding(11) var cloudShadowSampler: sampler;

// In material uniforms, add:
struct CloudShadowInfo {
  worldSize: f32,
  shadowCenter: vec2<f32>,  // XZ center of shadow map
  shadowIntensity: f32,     // 0-1, how dark shadows are
};

// In fragment shader:
fn sampleCloudShadow(worldPos: vec3f) -> f32 {
  // Convert world position to shadow map UV
  let shadowUV = (worldPos.xz - cloudShadowInfo.shadowCenter) / cloudShadowInfo.worldSize + 0.5;

  // Sample shadow density
  let density = textureSample(cloudShadowMap, cloudShadowSampler, shadowUV).r;

  // Convert density to shadow factor (0 = full shadow, 1 = no shadow)
  return 1.0 - (density * cloudShadowInfo.shadowIntensity);
}

// In lighting calculation:
fn calculateLighting(...) -> vec3f {
  var lighting = /* existing lighting */;

  // Apply cloud shadow
  let shadowFactor = sampleCloudShadow(worldPosition);
  lighting *= mix(0.3, 1.0, shadowFactor);  // Never completely black

  return lighting;
}
```

#### 2.6: Add Shadow Blur Pass (Optional)

For softer shadows, add 2-pass separable Gaussian blur:

**New File**: `packages/rewild-renderer/lib/post-processes/ShadowBlurPass.ts`

```typescript
export class ShadowBlurPass {
  // Simple 5-tap Gaussian blur
  // Horizontal pass → vertical pass
  // Increases shadow map quality for low resolution
}
```

### Validation Criteria

- [ ] Soft shadows visible on terrain matching cloud positions
- [ ] Shadows move with wind (follow cloud animation)
- [ ] Shadow intensity controlled by cloudiness parameter
- [ ] Performance: < 0.5ms for shadow map update (every 2 frames)
- [ ] No visible aliasing or flickering
- [ ] Shadows fade smoothly at edges of coverage area

### Debugging Tools

Add visualization mode:

```typescript
// Press 'K' to toggle shadow map visualization
if (debugMode === 'cloudShadows') {
  // Render shadow map as overlay on screen
}
```

### Performance Notes

- 1024×1024 shadow map = 2MB memory
- Update every 2 frames = 0.25ms average per frame
- 32 samples per pixel = 33M samples/frame (manageable)

### Rollback Strategy

If performance issues:

1. Reduce resolution to 512×512
2. Increase update frequency to every 4 frames
3. Reduce samples to 16 per ray
4. If still problematic, disable feature

---

## Phase 3: Fix Altitude Limitations (6-8 hours)

**Goal**: Support flying through clouds at any altitude with proper fade behavior.

### Architecture Decision

Update sphere intersection logic to handle 3 cases:

1. **Below clouds** (current working case)
2. **Inside clouds** - Camera between CLOUD_START and CLOUD_START+CLOUD_HEIGHT
3. **Above clouds** - Camera looking down

Add fade system when inside clouds for performance and visual quality.

### Tasks

#### 3.1: Update Cloud Raymarching Math

**File**: `packages/rewild-renderer/lib/shaders/atmosphere/clouds.wgsl`

Replace the `skyRay()` function:

```wgsl
fn skyRay(cameraPos: vec3f, dir: vec3f, sun_direction: vec3f) -> vec4f {
  const ATM_START = EARTH_RADIUS + CLOUD_START;
  const ATM_END = EARTH_RADIUS + CLOUD_START + CLOUD_HEIGHT;

  // Calculate camera height above ground
  let camHeight = length(cameraPos - vec3f(0.0, -EARTH_RADIUS, 0.0));

  // Intersect ray with inner and outer cloud spheres
  let tInner = intersectSphere(cameraPos, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), ATM_START);
  let tOuter = intersectSphere(cameraPos, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), ATM_END);

  var tStart: f32;
  var tEnd: f32;
  var isInsideClouds = false;

  // Case 1: Below clouds (camHeight < ATM_START)
  if (camHeight < ATM_START) {
    if (tInner < 0.0 || dir.y < 0.0) {
      // Ray pointing down or no intersection
      return vec4f(0.0, 0.0, 0.0, 0.0);
    }
    tStart = tInner;
    tEnd = tOuter;
  }
  // Case 2: Inside cloud layer (ATM_START <= camHeight <= ATM_END)
  else if (camHeight <= ATM_END) {
    isInsideClouds = true;
    tStart = 0.0;  // Start from camera

    // Figure out which direction we're going
    if (dir.y > 0.0) {
      // Looking up - ray to outer sphere
      tEnd = tOuter > 0.0 ? tOuter : 0.0;
    } else {
      // Looking down - ray to inner sphere
      tEnd = tInner > 0.0 ? tInner : 0.0;
    }

    // Limit ray length when inside clouds for performance
    tEnd = min(tEnd, 1000.0);
  }
  // Case 3: Above clouds (camHeight > ATM_END)
  else {
    if (tOuter < 0.0 || dir.y > 0.0) {
      // Ray pointing up or no intersection
      return vec4f(0.0, 0.0, 0.0, 0.0);
    }
    // Looking down at clouds
    tStart = tOuter > 0.0 ? tOuter : tInner;
    tEnd = tInner;
  }

  // Early exit if invalid range
  if (tStart >= tEnd || tEnd <= 0.0) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }

  // Calculate sample count based on ray length and LOD
  let rayLength = tEnd - tStart;
  var nbSample = i32(NUM_CLOUD_SAMPLES * min(1.0, rayLength / 2000.0));

  // When inside clouds, reduce samples significantly
  if (isInsideClouds) {
    nbSample = i32(f32(nbSample) * 0.3);  // 70% fewer samples
  }

  nbSample = max(nbSample, 8);  // Minimum 8 samples

  let stepS = rayLength / f32(nbSample);
  var rayPos = cameraPos + dir * tStart;

  // Continue with existing ray marching loop...
  var color = vec3f(0.0);
  var transmittance = 1.0;
  let mu = dot(sun_direction, dir);
  let phaseFunction = numericalMieFit(mu);

  // Add jitter for better quality
  rayPos += dir * stepS * hash1(dot(dir, vec3f(12.256, 2.646, 6.356)) + object.iTime * 0.00001);

  for (var i = 0; i < nbSample; i++) {
    let result = clouds(rayPos);
    let density = result.density;
    let cloudHeight = result.cloudHeight;

    if (density > 0.0) {
      let intensity = lightRay(rayPos, phaseFunction, density, mu, sun_direction, cloudHeight);

      var cloudAmbientColor = mix(CLOUD_AMBIENT_NIGHT_COLOR, CLOUD_AMBIENT_EVENING_COLOR, smoothstep(-0.2, 0.2, sunDotUp));
      cloudAmbientColor = mix(cloudAmbientColor, CLOUD_AMBIENT_DAY_COLOR, smoothstep(0.2, 0.8, sunDotUp));

      let ambient = (0.5 + 0.6 * cloudHeight) * cloudAmbientColor * 6.5 + vec3f(0.8) * max(0.0, 1.0 - 2.0 * cloudHeight);

      var radiance = ambient + (SUN_POWER * intensity * mix(vec3f(0.8, 0.5, 0.3), vec3f(1.0), clamp(pow(sunDotUp, 3.0), 0.0, 1.0)));
      radiance *= density;

      color += transmittance * (radiance - radiance * exp(-density * stepS)) / density;
      transmittance *= exp(-density * stepS);

      if (transmittance <= 0.01) {
        break;
      }
    }

    rayPos += dir * stepS;
  }

  // Apply fog when inside clouds for smooth transition
  if (isInsideClouds) {
    let distanceInClouds = rayLength;
    let fogAmount = 1.0 - exp(-0.001 * distanceInClouds);

    // Blend with cloud ambient color
    var cloudFogColor = mix(CLOUD_AMBIENT_NIGHT_COLOR, CLOUD_AMBIENT_DAY_COLOR, smoothstep(-0.2, 0.8, sunDotUp));
    color = mix(color, cloudFogColor * 0.5, fogAmount);
  }

  let background = getAtmosphereColor(sun_direction, dir, mu, vec3f(0.0));
  color += background * pow(transmittance, 2.0);

  return vec4f(color, 1.0 - transmittance);
}
```

#### 3.2: Add Altitude Control Parameter

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

```typescript
export class SkyRenderer {
  maxFlightAltitude: number; // Maximum height camera can go

  constructor(parent: Transform) {
    // ... existing code ...
    this.maxFlightAltitude = 10000; // 10km default
  }

  // Add getter/setter for altitude parameters
  setCloudAltitude(start: number, height: number) {
    // Update shader constants
    // This would require shader recompilation or uniforms
  }
}
```

#### 3.3: Update Atmosphere Shader Too

**File**: `packages/rewild-renderer/lib/shaders/atmosphere/atmosphere.wgsl`

Apply same intersection fix to atmosphere pass (though less critical since it's cheaper).

#### 3.4: Add Debug Visualization

Add on-screen display showing:

- Current camera altitude
- Cloud layer bounds
- Current rendering mode (below/inside/above)

```typescript
// In SkyRenderer.update()
if (this.debugMode) {
  console.log(`Camera altitude: ${camera.position.y}m`);
  console.log(`Cloud layer: ${CLOUD_START}m - ${CLOUD_START + CLOUD_HEIGHT}m`);
  console.log(`Render mode: ${getRenderMode(camera.position.y)}`);
}
```

### Validation Criteria

- [ ] Can fly smoothly from ground level up to 10km+
- [ ] Clouds fade naturally when camera enters them
- [ ] Looking down from above shows correct cloud layer
- [ ] No visual popping or artifacts at transition boundaries
- [ ] Performance maintained (may be better when inside clouds due to fewer samples)
- [ ] Works correctly at sunrise/sunset (sun near horizon)

### Testing Checklist

Test these camera positions and directions:

- [ ] Ground level (500m) looking up
- [ ] Just below clouds (1100m) looking up
- [ ] Cloud layer base (1200m) looking horizontal
- [ ] Middle of clouds (1500m) in all directions
- [ ] Cloud layer top (1800m) looking down
- [ ] Above clouds (3000m) looking down
- [ ] Very high (10km) looking down

### Performance Impact

- Below clouds: Same as before
- Inside clouds: ~2x faster (fewer samples, shorter rays)
- Above clouds: Similar to below

### Rollback Strategy

If visual quality suffers or bugs appear:

1. Keep old code path as fallback
2. Add toggle: `useNewAltitudeSystem: boolean`
3. Revert to sphere intersection for below-clouds case only

---

## Phase 4: God Rays (6-8 hours)

**Goal**: Add cheap screen-space god rays with light shafts through cloud gaps.

### Architecture Decision

Use **hybrid approach**:

1. **Screen-space radial blur** for atmospheric scattering (very cheap)
2. **Cloud transmittance mask** to create shafts through gaps (low cost)
3. Only active when looking toward sun (< 90° from sun direction)

### Tasks

#### 4.1: Create God Ray Post-Process

**New File**: `packages/rewild-renderer/lib/post-processes/GodRaysPostProcess.ts`

```typescript
export interface GodRayConfig {
  numSamples: number; // 16-32 samples for radial blur
  density: number; // 0-1, intensity of rays
  weight: number; // 0-1, brightness
  decay: number; // 0-1, falloff along rays
  exposure: number; // 0-5, overall brightness
  enabled: boolean;
}

export class GodRaysPostProcess implements IPostProcess {
  renderTarget: GPUTexture;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  config: GodRayConfig;

  // Source textures
  cloudTransmittance: GPUTexture; // Alpha channel from clouds
  sceneColor: GPUTexture; // Main scene

  constructor(config?: Partial<GodRayConfig>) {
    this.config = {
      numSamples: 24,
      density: 0.5,
      weight: 0.8,
      decay: 0.95,
      exposure: 1.5,
      enabled: true,
      ...config,
    };
  }

  init(renderer: Renderer): void {
    const { device, canvas } = renderer;

    // Create quarter-res render target for performance
    const width = Math.floor(canvas.width / 2);
    const height = Math.floor(canvas.height / 2);

    this.renderTarget = device.createTexture({
      size: [width, height, 1],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Create shader module
    // Create pipeline
    // Create uniform buffer for sun screen position
  }

  render(renderer: Renderer, camera: Camera, sunPosition: Vector3): void {
    if (!this.config.enabled) return;

    // Project sun to screen space
    const sunScreenPos = this.projectToScreen(sunPosition, camera);

    // Only render if sun is in front of camera
    if (sunScreenPos.z > 0 && this.isInScreenBounds(sunScreenPos)) {
      // Run radial blur pass
    }
  }

  private projectToScreen(worldPos: Vector3, camera: Camera): Vector3 {
    // Transform world position to NDC
    // Return screen coordinates (0-1, 0-1, depth)
  }
}
```

#### 4.2: Create God Rays Shader

**New File**: `packages/rewild-renderer/lib/shaders/godRays.wgsl`

```wgsl
struct GodRayUniforms {
  sunScreenPos: vec2<f32>,
  density: f32,
  weight: f32,
  decay: f32,
  exposure: f32,
  numSamples: f32,
};

@group(0) @binding(0) var<uniform> uniforms: GodRayUniforms;
@group(0) @binding(1) var cloudTexture: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VSOutput {
  // Full-screen triangle
}

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  // Direction from this pixel to sun
  let toSun = uniforms.sunScreenPos - uv;
  let dist = length(toSun);
  let dir = toSun / dist;

  // Radial blur parameters
  let numSamples = i32(uniforms.numSamples);
  let stepSize = uniforms.density / f32(numSamples);

  var rayColor = vec3<f32>(0.0);
  var currentWeight = 1.0;
  var currentPos = uv;

  // March toward sun
  for (var i = 0; i < numSamples; i++) {
    currentPos += dir * stepSize;

    // Sample cloud transmittance (alpha channel)
    let sample = textureSample(cloudTexture, linearSampler, currentPos);

    // Transmittance: 0 = blocked by clouds, 1 = clear sky
    let transmittance = 1.0 - sample.a;

    // Accumulate scattered light
    rayColor += sample.rgb * transmittance * currentWeight;

    // Decay weight as we march
    currentWeight *= uniforms.decay;
  }

  // Normalize and apply exposure
  rayColor /= f32(numSamples);
  rayColor *= uniforms.exposure;

  // Apply weight
  rayColor *= uniforms.weight;

  // Distance falloff (stronger near sun)
  let falloff = smoothstep(1.0, 0.0, dist);
  rayColor *= falloff;

  return vec4<f32>(rayColor, 1.0);
}
```

#### 4.3: Integrate into Sky Rendering Pipeline

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

```typescript
import { GodRaysPostProcess } from '../../post-processes/GodRaysPostProcess';

export class SkyRenderer {
  godRaysPass: GodRaysPostProcess;

  constructor(parent: Transform) {
    // ... existing code ...
    this.godRaysPass = new GodRaysPostProcess({
      numSamples: 24,
      density: 0.4,
      weight: 0.6,
      decay: 0.96,
      exposure: 1.2,
      enabled: true,
    });
  }

  init(renderer: Renderer): void {
    // ... existing code ...

    // Initialize god rays after clouds pass
    this.godRaysPass.cloudTransmittance = this.cloudsPass.renderTarget;
    this.godRaysPass.init(renderer);
  }

  render(...): void {
    // ... existing cloud/atmosphere rendering ...

    this.bloomPass.render(renderer);

    // ADD: God rays before TAA
    this.godRaysPass.render(renderer, camera, this.sun.transform.position);

    this.taaPass.render(renderer);

    // Update final composite to include god rays
    this.finalPass.godRaysTexture = this.godRaysPass.renderTarget;
    this.finalPass.render(renderer, pass, camera);
  }
}
```

#### 4.4: Update Final Composite Shader

**File**: `packages/rewild-renderer/lib/shaders/atmosphereFinal.wgsl`

```wgsl
// Add binding for god rays
@group(0) @binding(5) var godRaysTexture: texture_2d<f32>;

@fragment
fn fs(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = fragCoord.xy / vec2<f32>(uniforms.resolutionX, uniforms.resolutionY);

  // Sample existing layers
  let atmosphere = textureSample(atmosphereTexture, sampler, uv);
  let clouds = textureSample(cloudsTexture, sampler, uv);

  // Sample god rays (at half-res, so bilinear upscale)
  let godRays = textureSample(godRaysTexture, sampler, uv);

  // Composite layers
  var finalColor = atmosphere.rgb;

  // Add clouds with alpha blending
  finalColor = mix(finalColor, clouds.rgb, clouds.a);

  // Add god rays (additive blending)
  finalColor += godRays.rgb * godRays.a;

  // Apply fog (existing code)
  // ...

  return vec4<f32>(finalColor, 1.0);
}
```

#### 4.5: Add Runtime Controls

Expose god ray parameters for tuning:

```typescript
// In SkyRenderer
export class SkyRenderer {
  // God ray settings
  godRayIntensity: number = 1.0;    // Master intensity
  godRayDensity: number = 0.4;      // How far rays extend
  godRayDecay: number = 0.96;       // Falloff rate

  update(...) {
    // ... existing code ...

    // Update god ray parameters
    this.godRaysPass.config.density = this.godRayDensity;
    this.godRaysPass.config.weight = this.godRayIntensity;
    this.godRaysPass.config.decay = this.godRayDecay;

    // Disable god rays at night
    const sunAngle = dot(this.sun.transform.forward, vec3(0, 1, 0));
    this.godRaysPass.config.enabled = sunAngle > -0.2;
  }
}
```

### Validation Criteria

- [ ] God rays visible when looking toward sun
- [ ] Rays shine through gaps in clouds (dark clouds block rays)
- [ ] Intensity scales with sun elevation (weaker at sunset/sunrise)
- [ ] No visible banding or artifacts
- [ ] Performance: < 0.5ms at half resolution (24 samples)
- [ ] Rays disabled when sun below horizon

### Performance Notes

- Quarter-res rendering: 960×540 for 1920×1080 screen
- 24 samples × 518k pixels = 12.4M texture lookups
- Expected cost: 0.3-0.5ms on RTX 3080

### Quality Tuning

Adjust these parameters for look:

- **numSamples**: 16 = fast/noisy, 32 = smooth/expensive
- **density**: 0.2 = short rays, 0.8 = long rays
- **decay**: 0.9 = sharp falloff, 0.98 = gradual falloff
- **weight**: Overall brightness multiplier

### Rollback Strategy

If performance issues or visual problems:

1. Reduce samples to 16
2. Reduce resolution to 1/4 (960×540 → 480×270)
3. Disable feature entirely with toggle

---

## Phase 5: Performance Optimization (10-15 hours)

**Goal**: Implement temporal reprojection and dynamic LOD for maximum performance.

### Priority: HIGH

This phase can dramatically improve performance (2-4x speedup for cloud rendering).

### Tasks

#### 5.1: Implement Temporal Reprojection for Clouds

**New File**: `packages/rewild-renderer/lib/renderers/sky/TemporalCloudRenderer.ts`

**Concept**: Reuse 15/16 samples from previous frames, only cast 1/16 new rays.

```typescript
export class TemporalCloudRenderer {
  historyTexture: GPUTexture; // Previous frame clouds
  velocityTexture: GPUTexture; // Camera motion vectors
  sampleIndexTexture: GPUTexture; // Which samples to update

  currentFrame: number = 0;
  historyValid: boolean = false;

  init(renderer: Renderer): void {
    const { device, canvas } = renderer;

    // Create history texture (same format as clouds)
    this.historyTexture = device.createTexture({
      size: [canvas.width * 0.8, canvas.height * 0.8, 1],
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Create sample index texture (which 1/16 to update this frame)
    this.sampleIndexTexture = device.createTexture({
      size: [canvas.width * 0.8, canvas.height * 0.8, 1],
      format: 'r8uint',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  render(encoder: GPUCommandEncoder, camera: Camera, prevCamera: Camera): void {
    if (!this.historyValid) {
      // First frame: render full quality
      this.renderFullQuality(encoder);
      this.historyValid = true;
      return;
    }

    // Reproject previous frame
    this.reprojectHistory(encoder, camera, prevCamera);

    // Update 1/16 of pixels with new samples
    this.updatePartialSamples(encoder, this.currentFrame % 16);

    this.currentFrame++;
  }

  private reprojectHistory(
    encoder: GPUCommandEncoder,
    camera: Camera,
    prevCamera: Camera
  ): void {
    // Calculate motion vectors from camera movement
    // Reproject history texture to current frame
    // Reject samples that moved too much (disocclusion)
  }

  private updatePartialSamples(
    encoder: GPUCommandEncoder,
    sampleIndex: number
  ): void {
    // Only raymarch clouds for pixels where (pixel.xy % 16) == sampleIndex
    // This spreads 16 frames of work across each pixel
  }
}
```

**Shader modification** (`cloudsTemporal.wgsl`):

```wgsl
@fragment
fn fs(...) -> @location(0) vec4<f32> {
  let pixelIndex = (i32(fragCoord.x) % 4) * 4 + (i32(fragCoord.y) % 4);

  if (pixelIndex == uniforms.currentSampleIndex) {
    // This pixel gets updated this frame - do full raymarch
    return skyRay(cameraPos, dir, sun_direction);
  } else {
    // Reuse history - reproject from previous frame
    let prevUV = reprojectToHistory(fragCoord.xy, uniforms.prevViewProjMatrix);
    let historySample = textureSample(historyTexture, sampler, prevUV);

    // Check if history is valid (no disocclusion, similar direction)
    if (isHistoryValid(prevUV, dir)) {
      return historySample;
    } else {
      // History invalid - fall back to lower quality raymarching
      return skyRayLowQuality(cameraPos, dir, sun_direction);
    }
  }
}
```

**Benefits**:

- 15/16 pixels are "free" each frame
- Amortizes expensive raymarching over 16 frames
- Theoretical 16x speedup (practical: 8-12x due to reprojection cost)

#### 5.2: Add Dynamic LOD System

Reduce sample count based on:

- Distance from camera
- Screen-space derivatives (detail needed)
- Pixel importance (center vs edges)

```wgsl
fn calculateLOD(fragCoord: vec2<f32>, dir: vec3<f32>, rayLength: f32) -> f32 {
  // 1. Distance LOD
  let distanceLOD = clamp(rayLength / 5000.0, 0.0, 1.0);

  // 2. Screen-space LOD (edge pixels need less detail)
  let screenCenter = vec2<f32>(uniforms.resolutionX, uniforms.resolutionY) * 0.5;
  let distFromCenter = length(fragCoord - screenCenter) / length(screenCenter);
  let screenLOD = smoothstep(0.0, 0.8, distFromCenter);

  // 3. View angle LOD (grazing angles need fewer samples)
  let viewAngleLOD = 1.0 - abs(dir.y);

  // Combine LODs
  return max(distanceLOD, max(screenLOD, viewAngleLOD * 0.5));
}

fn skyRayWithLOD(...) -> vec4<f32> {
  let lod = calculateLOD(fragCoord.xy, dir, rayLength);

  // Scale samples from 80 (full quality) to 16 (low quality)
  let numSamples = i32(mix(80.0, 16.0, lod));

  // Continue with ray marching using numSamples...
}
```

#### 5.3: Migrate to Compute Shader (Optional, Advanced)

If additional performance needed:

```wgsl
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let uv = vec2<f32>(id.xy) / vec2<f32>(uniforms.resolutionX, uniforms.resolutionY);
  let dir = calculateRayDirection(uv);

  // Direct pixel write to storage texture
  let color = skyRay(uniforms.cameraPos, dir, uniforms.sunDir);
  textureStore(outputTexture, id.xy, color);
}
```

**Benefits**:

- No rasterization overhead
- Better cache coherency
- Can use shared memory for optimization

**Costs**:

- More complex pipeline setup
- Debugging harder

#### 5.4: Optimize Noise Functions

Current FBM is expensive (3 octaves, matrix multiplication):

**Options**:

1. **Pre-bake noise to 3D texture** (memory vs compute tradeoff)
2. **Use cheaper noise** (Value noise instead of Perlin)
3. **Cache noise lookups** in shared memory (compute shader)

```wgsl
// Replace fbm() with texture lookup
fn fbm(p: vec3<f32>) -> f32 {
  // Sample pre-baked 3D noise texture
  return textureSampleLevel(fbmTexture, sampler, p * 0.01, 0.0).r;
}
```

**3D Texture generation** (one-time cost at startup):

```typescript
class FBMTextureGenerator {
  generate(device: GPUDevice, resolution: number = 64): GPUTexture {
    // 64³ texture = 1MB for R8
    const texture = device.createTexture({
      size: [resolution, resolution, resolution],
      format: 'r8unorm',
      dimension: '3d',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Generate noise on CPU or compute shader
    // Write to texture

    return texture;
  }
}
```

#### 5.5: Implement Frustum Culling for Shadow Map

Don't update shadow map regions not visible to camera:

```typescript
render(encoder: GPUCommandEncoder, camera: Camera): void {
  // Calculate which part of shadow map is in camera frustum
  const visibleBounds = this.calculateVisibleBounds(camera);

  // Only render that subregion
  // Can be 2-4x faster when looking away from sun
}
```

### Validation Criteria

- [ ] Temporal reprojection: No visible ghosting or lag
- [ ] LOD system: Smooth transitions, no popping
- [ ] Performance: 2-4x improvement on cloud rendering
- [ ] Total sky system: < 2ms per frame at 1920×1080
- [ ] Memory: < 100MB additional for history buffers

### Performance Target

**Before optimization**:

- Clouds: 4-6ms
- Atmosphere: 1ms
- Post-processing: 2ms
- **Total: 7-9ms**

**After optimization**:

- Clouds: 1-2ms (temporal + LOD)
- Atmosphere: 0.5ms (cubemap)
- Post-processing: 1.5ms
- **Total: 3-4ms**

**Margin for 120 FPS**: 8.3ms/frame budget, sky using 36-48% of frame time.

---

## Phase 6: Dual-Layer Clouds (Optional, 8-12 hours)

**Goal**: Add high-altitude cirrus layer for visual variety. Only if Phase 5 performance allows.

### Prerequisites

- Phase 5 complete with performance target met
- At least 2-3ms frame time budget remaining

### Architecture

Render second cloud layer at higher altitude (6-8km) with different characteristics:

- Thinner, wispier clouds
- Less dense
- Different wind speed
- Simpler raymarching (fewer samples)

### Tasks

#### 6.1: Create Dual-Layer Cloud System

```typescript
export class DualLayerCloudRenderer {
  lowClouds: CloudsRenderer; // Existing cumulus (1.2-1.8km)
  highClouds: CloudsRenderer; // New cirrus (6-8km)

  render(encoder: GPUCommandEncoder): void {
    // Render both layers to separate targets
    this.lowClouds.render(encoder);
    this.highClouds.render(encoder);

    // Composite in final pass (back-to-front)
  }
}
```

#### 6.2: Cirrus Cloud Shader

Simplified version of clouds.wgsl with:

- Fewer samples (20 instead of 80)
- Simpler noise (2 octaves instead of 3)
- Less lighting complexity

#### 6.3: Add Layer Controls

```typescript
export interface CloudLayerConfig {
  altitude: number;
  thickness: number;
  coverage: number;
  windSpeed: number;
  enabled: boolean;
}

export class SkyRenderer {
  lowCloudConfig: CloudLayerConfig;
  highCloudConfig: CloudLayerConfig;
}
```

### Performance Budget

High clouds should cost < 1ms to maintain 120 FPS target.

---

## Additional Recommendations

### Structural Improvements

#### Separate Concerns

```
packages/rewild-renderer/lib/renderers/sky/
├── SkyRenderer.ts              (Orchestrator)
├── atmosphere/
│   ├── AtmosphereRenderer.ts   (Sky gradient)
│   ├── NightSkyCubemap.ts      (Stars/galaxy)
│   └── FogRenderer.ts          (Height fog)
├── clouds/
│   ├── CloudsRenderer.ts       (Main volumetric)
│   ├── CloudShadowRenderer.ts  (Shadow map)
│   └── TemporalCloudRenderer.ts (Temporal reuse)
├── effects/
│   ├── GodRaysPass.ts          (Light shafts)
│   └── CloudBloomPass.ts       (Cloud glow)
└── SkyResources.ts             (Texture/buffer management)
```

#### Resource Management

Create `SkyResources` class for centralized cleanup:

```typescript
export class SkyResources {
  private textures: Map<string, GPUTexture> = new Map();
  private buffers: Map<string, GPUBuffer> = new Map();

  register(name: string, resource: GPUTexture | GPUBuffer): void;

  resize(width: number, height: number): void {
    // Only recreate textures that need it
    for (const [name, texture] of this.textures) {
      if (needsResize(texture, width, height)) {
        texture.destroy();
        this.textures.set(name, recreate(texture, width, height));
      }
    }
  }

  dispose(): void {
    for (const texture of this.textures.values()) {
      texture.destroy();
    }
    for (const buffer of this.buffers.values()) {
      buffer.destroy();
    }
  }
}
```

#### Configuration System

```typescript
export interface SkyConfig {
  clouds: {
    enabled: boolean;
    quality: 'low' | 'medium' | 'high' | 'ultra';
    temporalReprojection: boolean;
    shadows: boolean;
  };
  atmosphere: {
    nightSkyCubemap: boolean;
    godRays: boolean;
    fog: boolean;
  };
  performance: {
    targetFrameTime: number; // Auto-adjust quality to meet target
    dynamicLOD: boolean;
  };
}
```
