# Weather System

## Overview

Add a dynamic weather system to the atmospheric renderer. This covers four interconnected features:

1. **Overcast sky response** — sky gradient and sun disk adapt to cloud cover so clear-sky blue is not visible through gaps in a heavy storm
2. **Precipitation** — screen-space rain and snow with depth layers, wind alignment, and gust variation
3. **Indoor shelter** — a uniform-driven mechanism to suppress precipitation when the camera is inside a structure
4. **Lightning** — screen-space flash, cloud illumination boost, and an optional procedural bolt pass

All precipitation rendering uses a screen-space post-process pass inserted after TAA. No 3D particle geometry is required.

---

## New Controls

The following properties are added to `SkyRenderer`. They are designer-facing parameters, readable and writable at runtime.

| Property        | Type   | Range            | Default  | Description                                                         |
| --------------- | ------ | ---------------- | -------- | ------------------------------------------------------------------- |
| `windDirection` | `vec2` | any (normalized) | `(1, 0)` | Normalized XZ direction clouds and precipitation move toward        |
| `precipitation` | `f32`  | 0–1              | `0.0`    | Amount of precipitation. 0 = none, 1 = heavy                        |
| `temperature`   | `f32`  | 0–1              | `0.5`    | 0 = freezing (snow), 1 = warm (rain). Drives rain vs snow blend     |
| `shelterAmount` | `f32`  | 0–1              | `0.0`    | 0 = fully outdoors, 1 = fully indoors. Fed by game logic (see note) |

> **`shelterAmount` — game logic dependency**: This uniform must be written by the game engine, not the renderer. The renderer exposes `skyRenderer.shelterAmount` as a writable float. A future system (structure detection, physics volumes, or raycasting) should update this value each frame based on whether the camera is inside an enclosed player-built structure. Until that system exists, `shelterAmount` defaults to `0.0` (outdoors). The document **does not** define how the game logic computes this value — that is a separate implementation task.

Gust intensity is **not** an exposed control. It is derived inside the shader from `windiness`:

```
gustStrength = windiness * windiness  // quadratic: subtle at low wind, strong at high
```

---

## Uniform Buffer Changes

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

The existing uniform buffer must be extended. Current layout ends with `windiness` at the tail. Append the following fields:

```typescript
// Add to uniformBufferSize calculation:
2 * 4 +  // windDirection (vec2: 8 bytes)
4 +      // precipitation
4 +      // temperature
4 +      // shelterAmount
4 +      // lightningFlash
// Total addition: +24 bytes
```

Update the `uniformData.set()` calls in `SkyRenderer.update()` to write these new fields at their correct byte offsets.

The WGSL uniform struct in `clouds.wgsl` and `atmosphere.wgsl` must be updated to match. Add to the `Object` struct (or whichever struct holds the shared sky uniforms):

```wgsl
windDirection: vec2<f32>,
precipitation: f32,
temperature: f32,
shelterAmount: f32,
lightningFlash: f32,
```

---

## Feature 1: Overcast Sky Gradient Response

**Goal**: When `cloudiness` is high, sky visible through cloud breaks should look pale and muted, not deep blue. The sun disk should become a diffuse glow rather than a sharp point.

**File**: `packages/rewild-renderer/lib/shaders/atmosphere/atmosphere.wgsl`

No new uniforms required. `cloudiness` is already available.

### Tasks

#### W1.1: Derive overcast factor

At the top of the fragment shader, compute:

```wgsl
// 0.0 at cloudiness < 0.5, ramps to 1.0 at cloudiness > 0.9
let overcastFactor = smoothstep(0.5, 0.9, object.cloudiness);
```

Gate the factor by sun elevation so the night sky is unaffected. The `sunDotUp` value is already available in the shader (dot product of sun direction with the world up vector):

```wgsl
// 0.0 at night (sunDotUp < -0.05), 1.0 during day (sunDotUp > 0.15)
// The overcast color shift only applies to the daytime sky gradient
let dayFactor      = smoothstep(-0.05, 0.15, sunDotUp);
let overcastFactor = smoothstep(0.5, 0.9, object.cloudiness) * dayFactor;
```

All subsequent uses of `overcastFactor` (zenith color, horizon color, sun disk) automatically become no-ops at night because the factor reaches zero.

#### W1.2: Lerp sky zenith color

Locate where the sky zenith/gradient colors are computed in `drawSkyAndHorizonFog()` or the equivalent function. Apply the overcast mix:

```wgsl
let clearZenith    = vec3<f32>(0.10, 0.28, 0.75);  // existing clear sky blue
let overcastZenith = vec3<f32>(0.52, 0.55, 0.60);  // pale desaturated gray-blue
let skyZenith = mix(clearZenith, overcastZenith, overcastFactor);
```

#### W1.3: Lerp horizon fog color

The horizon/fog color should also shift toward neutral when overcast:

```wgsl
let overcastHorizon = vec3<f32>(0.63, 0.63, 0.63);
let horizonColor = mix(FOG_COLOR_DAY, overcastHorizon, overcastFactor);
```

> **Note**: `FOG_COLOR_DAY` was recently updated for visual consistency. Verify the blended result looks correct at `cloudiness = 0.7` (the default) — it should be slightly muted but not fully gray.

#### W1.4: Fade the sun disk

Locate the sun disk / sun halo rendering. Scale its intensity and sharpness down as overcast increases:

```wgsl
// Soften sun disk edge — wider penumbra under cloud cover
let sunDiscSharpness = mix(512.0, 64.0, overcastFactor);
let sunDisc = pow(max(0.0, dot(direction, sunDirection)), sunDiscSharpness);

// Dim sun through clouds
let sunIntensity = mix(1.0, 0.15, overcastFactor);
let sunContrib = sunDisc * sunIntensity * SUN_COLOR;
```

### Acceptance Criteria

- [ ] At `cloudiness = 0.9+`, sky visible through cloud gaps is pale gray-white, not deep blue
- [ ] At `cloudiness = 0.0–0.4`, sky is unchanged from current look
- [ ] Transition is smooth across the 0.5–0.9 range — no visible step
- [ ] Sun disk becomes a diffuse bright smear at `cloudiness = 0.9`
- [ ] Night sky is completely unaffected — stars, galaxy, and night horizon look identical regardless of `cloudiness`
- [ ] Transition from day overcast → night is smooth (no pop at sunset when `cloudiness` is high)
- [ ] No new uniforms, no pipeline changes, no new files

---

## Feature 2: Precipitation System

**Goal**: Screen-space rain and snow rendered as a post-process pass inserted after TAA. Three depth layers simulate parallax. Precipitation aligns with `windDirection` and is modulated by gusts derived from `windiness`. The depth buffer provides per-layer occlusion.

### New Files

| Action | Path                                                                      |
| ------ | ------------------------------------------------------------------------- |
| Create | `packages/rewild-renderer/lib/post-processes/PrecipitationPostProcess.ts` |
| Create | `packages/rewild-renderer/lib/shaders/precipitation.wgsl`                 |

### W2.1: Wind direction in clouds shader

**File**: `packages/rewild-renderer/lib/shaders/atmosphere/clouds.wgsl`

Currently cloud UVs are offset along a single axis using `windiness`. Replace with directional movement:

```wgsl
// Before (single axis):
let windOffset = vec2<f32>(object.iTime * object.windiness * 0.01, 0.0);

// After (directional):
let windOffset = object.windDirection * object.iTime * windSpeed;
```

`object.windDirection` is the new `vec2<f32>` uniform. `windSpeed` can be derived from `windiness` as before (e.g. `windiness * 0.01`). The direction is normalized on the CPU side in `SkyRenderer`.

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] Add `windDirection: Vector2` property (default `(1, 0)`)
- [ ] Write `windDirection.x` and `windDirection.y` into the uniform buffer each frame
- [ ] Normalize the direction before writing

### W2.2: Create `PrecipitationPostProcess`

**File**: `packages/rewild-renderer/lib/post-processes/PrecipitationPostProcess.ts`

```typescript
export interface PrecipitationConfig {
  enabled: boolean;
}

export class PrecipitationPostProcess {
  renderTarget: GPUTexture;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  config: PrecipitationConfig;
}
```

- [ ] Create a **full-resolution** render target (`rgba8unorm`) — precipitation must align with scene edges, unlike god rays which can be upscaled
- [ ] Create a uniform buffer for per-frame data passed separately from the main sky uniform (precipitation has its own tight struct):
  ```wgsl
  struct PrecipUniforms {
    windDirection:  vec2<f32>,
    windSpeed:      f32,
    gustStrength:   f32,   // derived from windiness² on CPU
    precipitation:  f32,
    temperature:    f32,   // 0 = snow, 1 = rain
    shelterAmount:  f32,
    iTime:          f32,
    resolutionX:    f32,
    resolutionY:    f32,
    _pad:           vec2<f32>,
  };
  ```
- [ ] Bind the main scene depth texture (already available in the renderer) for per-layer occlusion
- [ ] Implement `render(renderer, skyUniforms)`: populate the uniform buffer, execute the pass
- [ ] Implement `resize(width, height)`: recreate the render target
- [ ] Implement `dispose()`: destroy texture and uniform buffer

### W2.3: Create precipitation shader

**File**: `packages/rewild-renderer/lib/shaders/precipitation.wgsl`

The shader renders both rain and snow in a single pass, blending between them based on `temperature`.

#### Gust function

```wgsl
fn gustFactor(t: f32) -> f32 {
    // Sum of three incommensurate sines → irregular, non-repeating variation
    let g = sin(t * 0.41) * 0.5
          + sin(t * 1.17) * 0.3
          + sin(t * 2.73) * 0.2;
    return 0.5 + g * 0.45; // remap to roughly [0.05, 0.95]
}
```

Effective wind velocity used throughout the shader:

```wgsl
let gust       = gustFactor(uniforms.iTime);
let effectiveSpeed = uniforms.windSpeed * (1.0 + uniforms.gustStrength * gust);
let windVec    = uniforms.windDirection * effectiveSpeed;
```

On the CPU side (`SkyRenderer.update()`):

```typescript
const gustStrength = this.windiness * this.windiness; // quadratic scaling
// Write gustStrength to the precipitation uniform buffer
```

#### Rain layer function

```wgsl
fn rainLayer(uv: vec2<f32>, cellScale: f32, speedMult: f32,
             streakLen: f32, opacity: f32, seed: f32) -> f32 {
    // Divide screen into cells of size cellScale
    let scaledUV = uv * cellScale;
    let cell     = floor(scaledUV);
    let cellUV   = fract(scaledUV);

    // Unique offset per cell using hash
    let h        = hash2(cell + seed);

    // Animate drop position along wind+gravity direction
    let velocity = windVec * speedMult + vec2<f32>(0.0, -1.0) * speedMult;
    let t        = uniforms.iTime * 0.5 * speedMult;
    let dropPos  = h + velocity * t;
    let dropUV   = fract(dropPos);

    // Streak: elongated along velocity direction
    let delta    = cellUV - dropUV;
    let velDir   = normalize(velocity);
    let along    = dot(delta, velDir);
    let perp     = dot(delta, vec2<f32>(-velDir.y, velDir.x));

    // SDF of the streak
    let streak   = smoothstep(0.01, 0.0, abs(perp)) *
                   smoothstep(0.0, -streakLen, along) *
                   smoothstep(-streakLen, -streakLen * 0.5, along);

    return streak * opacity;
}
```

#### Snow layer function

```wgsl
fn snowLayer(uv: vec2<f32>, cellScale: f32, speedMult: f32,
             flakeSize: f32, opacity: f32, seed: f32) -> f32 {
    let scaledUV = uv * cellScale;
    let cell     = floor(scaledUV);
    let cellUV   = fract(scaledUV);

    let h        = hash2(cell + seed);

    // Slow drift along wind, gravity, plus gust-driven lateral wobble
    let perp     = vec2<f32>(-uniforms.windDirection.y, uniforms.windDirection.x);
    let wobble   = sin(uniforms.iTime * 2.1 + h.x * 6.28)
                   * gustFactor(uniforms.iTime) * 0.3;
    let velocity = windVec * speedMult * 0.3
                   + perp * wobble
                   + vec2<f32>(0.0, -0.12 * speedMult); // gravity, slow
    let t        = uniforms.iTime * speedMult;
    let flakePos = h + velocity * t;
    let flakeUV  = fract(flakePos);

    // Circular SDF
    let delta    = cellUV - flakeUV;
    let dist     = length(delta);
    return smoothstep(flakeSize, flakeSize * 0.3, dist) * opacity;
}
```

#### Three depth layers

```wgsl
let depth = linearizeDepth(textureLoad(depthTexture, vec2i(fragCoord.xy), 0).r,
                            NEAR_PLANE, FAR_PLANE);

var rain  = 0.0;
var snow  = 0.0;

// Layer parameters: (cellScale, speedMult, size/length, opacity, depthThreshold, seed)
if (depth > 2.0) {
    // Near layer — large, fast, bright
    rain += rainLayer(uv, 8.0,  1.5, 0.08, 0.7, 0.0);
    snow += snowLayer(uv, 6.0,  1.5, 0.025, 0.8, 10.0);
}
if (depth > 10.0) {
    // Mid layer
    rain += rainLayer(uv, 18.0, 1.0, 0.05, 0.45, 3.7);
    snow += snowLayer(uv, 14.0, 1.0, 0.015, 0.5, 17.3);
}
if (depth > 40.0) {
    // Far layer — fine, slow, dim
    rain += rainLayer(uv, 40.0, 0.6, 0.03, 0.25, 7.1);
    snow += snowLayer(uv, 32.0, 0.6, 0.008, 0.3, 23.9);
}
```

#### Rain/snow blend and final output

```wgsl
// Blend between snow and rain based on temperature
// temperature: 0.0 = snow, 1.0 = rain; blend zone 0.35–0.65
let rainWeight = smoothstep(0.35, 0.65, uniforms.temperature);
let snowWeight = 1.0 - rainWeight;

// Color: rain is near-white with slight blue tint; snow is pure white
let rainColor = vec3<f32>(0.75, 0.80, 0.88);
let snowColor = vec3<f32>(0.95, 0.97, 1.00);

let intensity = uniforms.precipitation
              * (1.0 - uniforms.shelterAmount);  // suppressed indoors

let precipColor = mix(snowColor * snow, rainColor * rain,
                      rainWeight) * intensity;

return vec4<f32>(precipColor, max(rain, snow) * intensity);
```

### W2.4: Integrate into pipeline

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] Instantiate `PrecipitationPostProcess` in the constructor
- [ ] In `init()`: call `precipitationPass.init(renderer)`, bind depth texture
- [ ] In `render()`, insert after TAA and before FinalComp:
  ```
  cloudsPass → atmospherePass → bloomPass → godRaysPass → taaPass → precipitationPass → finalPass
  ```
  Placing after TAA prevents temporal smearing of fast-moving streaks.
- [ ] In `resize()`: call `precipitationPass.resize(width, height)`
- [ ] In `dispose()`: call `precipitationPass.dispose()`

### W2.5: Composite in final pass

**File**: `packages/rewild-renderer/lib/shaders/atmosphereFinal.wgsl`
**File**: `packages/rewild-renderer/lib/renderers/sky/SkyFinalPass.ts`

- [ ] Add texture binding for the precipitation render target
- [ ] Composite with additive blend after all other layers:
  ```wgsl
  let precip = textureSample(precipitationTexture, linearSampler, uv);
  finalColor += precip.rgb;
  ```

### Acceptance Criteria

- [ ] Rain visible when `precipitation > 0` and `temperature > 0.5`
- [ ] Snow visible when `precipitation > 0` and `temperature < 0.5`
- [ ] Sleet blend visible at `temperature ≈ 0.5` (mixed streaks and flakes simultaneously)
- [ ] Precipitation streaks/flakes align with `windDirection`
- [ ] At `windiness = 0.8+`, visible gust-driven direction shifts in precipitation
- [ ] Three depth layers create a parallax depth effect — near particles are larger and faster
- [ ] Rain/snow do not render on pixels where geometry is closer than the layer threshold (walls, ceilings occlude correctly)
- [ ] `shelterAmount = 1.0` suppresses all precipitation
- [ ] `shelterAmount = 0.5` renders at half intensity (doorway / partial cover)
- [ ] `precipitation = 0.0` produces zero output (pass should be skipped entirely)
- [ ] Precipitation direction changes when `windDirection` changes
- [ ] Performance: ≤ 0.3ms at 1920×1080

---

## Feature 3: Indoor Shelter Uniform

This feature is the renderer side of the indoor suppression system. It consists entirely of the `shelterAmount` uniform described in the [New Controls](#new-controls) section and consumed in the precipitation shader (W2.3 above).

### W3.1: Expose shelterAmount on SkyRenderer

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] Add `shelterAmount: number = 0.0` as a public property
- [ ] Write it into the precipitation uniform buffer each frame

### W3.2: Document the contract

The renderer makes no assumptions about how `shelterAmount` is computed. The expected contract:

| Value     | Meaning                                                                  |
| --------- | ------------------------------------------------------------------------ |
| `0.0`     | Camera is fully outdoors — full precipitation                            |
| `0.0–1.0` | Partial cover — doorway, overhang, window. Precipitation scales linearly |
| `1.0`     | Camera is fully indoors — no precipitation                               |

The game logic system (to be built separately) is responsible for writing a value to `renderer.atmosphere.skyRenderer.shelterAmount` each frame. Suitable approaches include:

- Casting N upward rays from the camera position; fraction that hit roof geometry becomes `shelterAmount`
- Using physics/trigger volumes tagged as "enclosed structure"
- Checking a voxel occupancy grid

### Acceptance Criteria

- [ ] `shelterAmount` property exists on `SkyRenderer` and is writable at runtime
- [ ] Changes to `shelterAmount` take effect within one frame (it is a uniform, not a pipeline setting)
- [ ] No crash or visual artifact when `shelterAmount = 0.0` or `1.0`

---

## Feature 4: Lightning

**Goal**: Randomised lightning strikes during heavy storms. Three layers: a screen-space flash (essential), a cloud illumination boost (cheap), and an optional screen-space bolt pass (visual).

### New Files

| Action | Path                                                                |
| ------ | ------------------------------------------------------------------- |
| Create | `packages/rewild-renderer/lib/renderers/sky/LightningController.ts` |
| Create | `packages/rewild-renderer/lib/post-processes/LightningBoltPass.ts`  |
| Create | `packages/rewild-renderer/lib/shaders/lightningBolt.wgsl`           |

### W4.1: LightningController

**File**: `packages/rewild-renderer/lib/renderers/sky/LightningController.ts`

A pure TypeScript class with no GPU resources. It owns strike timing and drives two values into the sky uniform buffer each frame: `lightningFlash` and a bolt descriptor.

```typescript
export interface LightningStrike {
  flashIntensity: number; // 0–1, current screen flash brightness
  boltVisible: boolean; // whether the bolt geometry should render
  boltScreenStart: [number, number]; // UV, top of bolt (near horizon/cloud base)
  boltScreenEnd: [number, number]; // UV, bottom of bolt (strike point)
  seed: number; // random seed for fractal shape this strike
}

export class LightningController {
  private nextStrikeIn: number = 0; // ms until next strike
  private strikePhase: 'idle' | 'bolt' | 'flash' | 'fade' = 'idle';
  private phaseTimer: number = 0;
  private currentStrike: LightningStrike;

  update(
    deltaMs: number,
    cloudiness: number,
    precipitation: number
  ): LightningStrike {
    // Strike probability scales with cloudiness × precipitation
    // Only fires when cloudiness > 0.65 and precipitation > 0.4
  }
}
```

State machine per strike:

```
IDLE  ──[random delay, scaled by cloudiness × precipitation]──▶  BOLT (50ms)
BOLT  ──────────────────────────────────────────────────────────▶  FLASH (30ms)
FLASH ──────────────────────────────────────────────────────────▶  FADE (150ms)
FADE  ──────────────────────────────────────────────────────────▶  IDLE
```

Average strike interval:

```typescript
// base interval + random jitter, shorter with heavier storms
const stormIntensity = cloudiness * precipitation;
const baseInterval = mix(30000, 3000, stormIntensity); // ms
const jitter = Math.random() * baseInterval * 0.5;
this.nextStrikeIn = baseInterval + jitter;
```

Multiple strikes may queue within a single storm (chain lightning). Allow up to 3 secondary strikes with 200–500ms gaps after the primary.

### W4.2: Screen-space flash

The `lightningFlash` float (0–1) is already included in the uniform buffer (see [Uniform Buffer Changes](#uniform-buffer-changes)). The final composite shader uses it:

**File**: `packages/rewild-renderer/lib/shaders/atmosphereFinal.wgsl`

```wgsl
// Add at end of fragment shader, before return
// Soft vignette: brightest at center, dimmer at edges
let screenCenter = vec2<f32>(0.5, 0.5);
let vignette     = 1.0 - smoothstep(0.3, 1.0, length(uv - screenCenter));
finalColor      += uniforms.lightningFlash * 2.5 * (0.6 + vignette * 0.4);
```

The `LightningController` writes `flashIntensity` to `skyRenderer.lightningFlash` each frame.

### W4.3: Cloud illumination boost

During `BOLT` and `FLASH` phases, briefly spike the cloud ambient multiplier. No new uniform is needed — drive the existing cloud ambient via a temporary override in `SkyRenderer.update()`:

```typescript
// In SkyRenderer.update():
const lightningBoost = this.lightning.currentStrike.flashIntensity * 3.0;
const cloudAmbientScale = 1.0 + lightningBoost;
// Write cloudAmbientScale into the clouds uniform (new field, or multiply existing ambient constant)
```

This makes clouds flash from within — the white-blue interior glow of a storm cloud. The effect lasts only for the `BOLT + FLASH` phases (~80ms total).

### W4.4: LightningBoltPass (optional visual)

**File**: `packages/rewild-renderer/lib/post-processes/LightningBoltPass.ts`
**File**: `packages/rewild-renderer/lib/shaders/lightningBolt.wgsl`

A screen-space bolt drawn as an SDF branching path. Only active when `boltVisible = true` (50ms per strike).

The shader generates a fractal bolt path procedurally from `boltScreenStart`, `boltScreenEnd`, and `seed`. No geometry upload is needed.

```wgsl
struct BoltUniforms {
  startUV:  vec2<f32>,   // top of bolt in screen UV space
  endUV:    vec2<f32>,   // bottom of bolt
  seed:     f32,
  intensity: f32,        // 0–1, from LightningController
  _pad:     vec2<f32>,
};

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  // Compute signed distance from a jittered path between startUV and endUV
  // Primary bolt + 2–3 random branches at ~40% intensity
  // Returns additive glow: white-blue core with purple outer glow

  let dist = distanceToBolt(uv, uniforms.startUV, uniforms.endUV, uniforms.seed);
  let glow = exp(-dist * 40.0) * uniforms.intensity;
  let core = exp(-dist * 200.0) * uniforms.intensity;

  // Bolt is white throughout — not tinted by sun color or atmosphere
  let boltColor = vec3<f32>(1.0, 1.0, 1.0);
  return vec4<f32>(boltColor * (glow + core), glow + core);
}
```

The bolt pass renders to its own small render target (full-res, `rgba8unorm`) and is composited additively in FinalComp. When `boltVisible = false`, the pass is skipped entirely (no cost).

### W4.5: Integrate into SkyRenderer

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] Instantiate `LightningController` and `LightningBoltPass` in the constructor
- [ ] In `update(deltaMs)`:
  1. Call `this.lightning.update(deltaMs, this.cloudiness, this.precipitation)`
  2. Write `strike.flashIntensity` → `lightningFlash` uniform field
  3. Write cloud ambient boost if in bolt/flash phase
- [ ] In `render()`, insert bolt pass between precipitation and FinalComp:
  ```
  taaPass → precipitationPass → lightningBoltPass → finalPass
  ```
- [ ] Skip `lightningBoltPass.render()` when `boltVisible = false`
- [ ] In `dispose()`: dispose both the controller (stateless, nothing to free) and the bolt pass

### W4.6: Directional light integration

The scene has one directional light that acts as the sun during the day and the night light after dark. When a lightning strike fires, this light should flash white to illuminate terrain, objects, and player-built structures — matching the screen flash exactly, since both read from the same `flashIntensity` source.

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] Expose `lightningFlashIntensity` as a public readonly getter:
  ```typescript
  get lightningFlashIntensity(): number {
    return this.lightning.currentStrike.flashIntensity;
  }
  ```

The game's lighting system (outside the renderer) reads this value each frame and applies the boost to the directional light:

```typescript
// In the main render/update loop:
const flash = renderer.atmosphere.skyRenderer.lightningFlashIntensity;

if (flash > 0) {
  directionalLight.intensity = baseIntensity + flash * LIGHTNING_PEAK_INTENSITY;
  // Shift color toward white — lightning is white, not sun-yellow or moon-blue
  directionalLight.color.set(
    lerp(currentLightColor.r, 1.0, flash),
    lerp(currentLightColor.g, 1.0, flash),
    lerp(currentLightColor.b, 1.0, flash)
  );
} else {
  directionalLight.intensity = baseIntensity;
  directionalLight.color.copy(currentLightColor);
}
```

`LIGHTNING_PEAK_INTENSITY` is a tunable constant — a value of `3.0–5.0×` the base sun intensity gives a convincing flashbulb effect without completely blowing out the scene.

> **Note**: `currentLightColor` should be the light's normal color for the current time of day (sun yellow, or the dim night color) — lerped toward white only during the flash. This ensures the directional light returns cleanly to its normal state once `flashIntensity` returns to zero.

### Acceptance Criteria

- [ ] Lightning only fires when `cloudiness > 0.65` and `precipitation > 0.4`
- [ ] Strike frequency increases with storm intensity (higher cloudiness × precipitation)
- [ ] Screen flash is visible for ~200ms per strike, with sharp onset and gradual fade
- [ ] Flash is slightly brighter at screen center than edges (vignette)
- [ ] Clouds briefly light from within during the bolt phase
- [ ] Bolt is visible for ~50ms — bright white-blue stroke with outer glow
- [ ] Bolt position varies per strike (random screen start/end, random fractal seed)
- [ ] No lightning at night or clear sky regardless of other settings
- [ ] No lightning when `precipitation = 0` or `cloudiness < 0.65`
- [ ] `LightningBoltPass` render is fully skipped between strikes — zero GPU cost when idle
- [ ] Performance: flash is negligible (2 ALU ops in FinalComp); bolt pass < 0.1ms when active
- [ ] Directional light flashes white during a strike — terrain and structures visibly illuminate
- [ ] Directional light color and intensity return to their pre-strike values immediately after fade
- [ ] Bolt visual is white — not tinted by sun color, atmospheric color, or time of day

---

## Full Pipeline After Implementation

```
Cloud Render
    │
    ▼
Atmosphere Render    ← overcastFactor applied here (W1)
    │
    ▼
Bloom
    │
    ▼
God Rays
    │
    ▼
TAA
    │
    ▼
Precipitation        ← new pass (W2), skipped if precipitation = 0
    │
    ▼
Lightning Bolt       ← new pass (W4.4), skipped between strikes
    │
    ▼
Final Composite      ← flash uniform applied here (W4.2), precip composited (W2.5)
```

---

## Performance Budget

| Component                       | Expected Cost          | Notes                                           |
| ------------------------------- | ---------------------- | ----------------------------------------------- |
| Overcast sky gradient (W1)      | < 0.01ms               | ALU-only change inside existing atmosphere pass |
| Precipitation pass (W2)         | ≤ 0.3ms                | Full-res, 3 layers, depth read                  |
| Lightning flash (W4.2)          | Negligible             | 2 ALU ops in existing FinalComp pass            |
| Lightning bolt pass (W4.4)      | < 0.1ms active, 0 idle | Skipped entirely between strikes                |
| Cloud illumination boost (W4.3) | Negligible             | Uniform write, existing pass                    |
| **Weather total**               | **≤ 0.4ms**            | Well within 8.3ms frame budget at 120fps        |

---

## Files Summary

| Action | Path                                                                      |
| ------ | ------------------------------------------------------------------------- |
| Modify | `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`               |
| Modify | `packages/rewild-renderer/lib/shaders/atmosphere/atmosphere.wgsl`         |
| Modify | `packages/rewild-renderer/lib/shaders/atmosphere/clouds.wgsl`             |
| Modify | `packages/rewild-renderer/lib/shaders/atmosphereFinal.wgsl`               |
| Modify | `packages/rewild-renderer/lib/renderers/sky/SkyFinalPass.ts`              |
| Create | `packages/rewild-renderer/lib/post-processes/PrecipitationPostProcess.ts` |
| Create | `packages/rewild-renderer/lib/shaders/precipitation.wgsl`                 |
| Create | `packages/rewild-renderer/lib/renderers/sky/LightningController.ts`       |
| Create | `packages/rewild-renderer/lib/post-processes/LightningBoltPass.ts`        |
| Create | `packages/rewild-renderer/lib/shaders/lightningBolt.wgsl`                 |

---

## Rollback Strategy

Each feature is independent and can be reverted individually:

- **W1 (overcast sky)**: revert the three color lerps in `atmosphere.wgsl` — no new files to delete
- **W2 (precipitation)**: remove `PrecipitationPostProcess` from `SkyRenderer`, delete the two new files, remove the composite line from `atmosphereFinal.wgsl`
- **W3 (shelter)**: remove `shelterAmount` from the uniform buffer and precipitation shader
- **W4 (lightning)**: remove `LightningController` and `LightningBoltPass` from `SkyRenderer`, remove the flash line from `atmosphereFinal.wgsl`, delete the three new files

None of these features modify existing cloud or atmosphere rendering logic in ways that would break existing behaviour if removed.

## Labels

`enhancement`, `renderer`, `sky`, `weather`, `post-processing`
