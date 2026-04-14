# Phase 3: Fix Altitude Limitations

## Summary

Update the cloud raymarching math to support cameras at any altitude — below, inside, or above the cloud layer. Currently the sphere intersection logic in `clouds.wgsl` only handles the "below clouds looking up" case. Flying into or above the cloud layer produces visual artifacts or no clouds at all. This phase also adds a fog effect when inside clouds for a smooth immersive transition.

## Motivation

The game is about exploration and flying. Players need to fly through clouds (entering them, seeing the interior fog, emerging above them). The current `skyRay()` function in `clouds.wgsl` uses sphere intersection math that assumes the camera is always below `CLOUD_START`. When the camera crosses into or above the cloud shell, intersection values flip signs and the ray march either starts at the wrong point or is skipped entirely.

## Prerequisites

- **Phase 1** completed (bug fixes, dispose cleanup)
- **Phase 2** completed (cloud shadows — shadow map math also needs altitude awareness)

## Architecture

Three camera altitude cases relative to the cloud shell (inner sphere at `EARTH_RADIUS + CLOUD_START`, outer sphere at `EARTH_RADIUS + CLOUD_START + CLOUD_HEIGHT`):

```
Case 3: Above clouds (camHeight > ATM_END)
─────────────────────────── outer sphere (ATM_END)
  Cloud volume
─────────────────────────── inner sphere (ATM_START)
Case 2: Inside clouds (ATM_START ≤ camHeight ≤ ATM_END)
─────────────────────────── inner sphere (ATM_START)
Case 1: Below clouds (camHeight < ATM_START) ← current working case
─────────────────────────── ground
```

Each case requires different ray start/end logic:

1. **Below**: Start at inner sphere hit, end at outer sphere hit (current code)
2. **Inside**: Start at camera (t=0), end at whichever sphere the ray hits first based on view direction
3. **Above**: Start at outer sphere hit, end at inner sphere hit (reversed from case 1)

When inside the cloud layer, reduce ray sample count significantly and apply distance-based fog to blend the camera into the cloud volume.

## Tasks

### 3.1: Update `skyRay()` in `clouds.wgsl`

**File**: `packages/rewild-renderer/lib/shaders/atmosphere/clouds.wgsl`

- [ ] Replace the sphere intersection + ray setup logic at the top of `skyRay()` with altitude-aware branching:

  ```wgsl
  fn skyRay(cameraPos: vec3f, dir: vec3f, sun_direction: vec3f) -> vec4f {
    const ATM_START = EARTH_RADIUS + CLOUD_START;
    const ATM_END = EARTH_RADIUS + CLOUD_START + CLOUD_HEIGHT;

    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let camHeight = length(cameraPos - earthCenter);

    // Intersect with both sphere shells
    let tInner = intersectSphere(cameraPos, dir, earthCenter, ATM_START);
    let tOuter = intersectSphere(cameraPos, dir, earthCenter, ATM_END);

    var tStart: f32;
    var tEnd: f32;
    var isInsideClouds = false;

    if (camHeight < ATM_START) {
      // Case 1: Below clouds
      if (tInner < 0.0) { return vec4f(0.0); }
      tStart = tInner;
      tEnd = tOuter;
    } else if (camHeight <= ATM_END) {
      // Case 2: Inside cloud layer
      isInsideClouds = true;
      tStart = 0.0;
      if (dir.y > 0.0) {
        tEnd = select(0.0, tOuter, tOuter > 0.0);
      } else {
        tEnd = select(0.0, tInner, tInner > 0.0);
      }
      tEnd = min(tEnd, 1000.0); // Cap ray length for performance
    } else {
      // Case 3: Above clouds
      if (tOuter < 0.0) { return vec4f(0.0); }
      tStart = select(tInner, tOuter, tOuter > 0.0);
      tEnd = tInner;
    }

    if (tStart >= tEnd || tEnd <= 0.0) { return vec4f(0.0); }
    // ... continue with ray marching ...
  }
  ```

- [ ] The existing `intersectSphere()` helper must correctly handle all sign cases. Verify it returns the **nearest positive** intersection, or both intersection distances. If it only returns the nearest positive hit, you may need a variant `intersectSphereBoth()` that returns both `t` values so the shader can pick the correct entry/exit
- [ ] Validate the `intersectSphere()` function handles rays originating inside the sphere (one `t` negative, one positive)

### 3.2: Adjust sample count for inside-clouds case

- [ ] When `isInsideClouds == true`, reduce the sample count:
  ```wgsl
  var nbSample = i32(NUM_CLOUD_SAMPLES * min(1.0, rayLength / 2000.0));
  if (isInsideClouds) {
    nbSample = i32(f32(nbSample) * 0.3); // 70% fewer samples
  }
  nbSample = max(nbSample, 8); // Floor at 8 samples minimum
  ```
- [ ] The reduced sample count is acceptable because:
  - Inside clouds, the player sees fog anyway — fine detail isn't visible
  - Ray lengths are short (capped at 1000 units)
  - The fog overlay (task 3.3) handles the rest visually

### 3.3: Add cloud interior fog effect

- [ ] After the ray march loop, when `isInsideClouds == true`, apply a distance-based fog blend:
  ```wgsl
  if (isInsideClouds) {
    let distanceInClouds = tEnd - tStart;
    let fogAmount = 1.0 - exp(-0.001 * distanceInClouds);
    var cloudFogColor = mix(
      CLOUD_AMBIENT_NIGHT_COLOR,
      CLOUD_AMBIENT_DAY_COLOR,
      smoothstep(-0.2, 0.8, sunDotUp)
    );
    color = mix(color, cloudFogColor * 0.5, fogAmount);
  }
  ```
- [ ] The fog color should respond to time of day (night/sunset/day) using the same ambient color logic as the main cloud lighting
- [ ] Fog density (`0.001` constant) should be tunable — consider exposing it as a uniform or at least making it a const at the top of the function

### 3.4: Update atmosphere shader for altitude awareness

**File**: `packages/rewild-renderer/lib/shaders/atmosphere/atmosphere.wgsl`

- [ ] The atmosphere pass also does sphere intersection math for fog/sky blending. Apply the same altitude-aware logic to prevent artifacts when above the atmosphere's reference sphere
- [ ] This is less critical than the clouds fix since the atmosphere shader is cheaper and the visual issues are subtler, but it needs to be done for consistency
- [ ] Verify that the `drawSkyAndHorizonFog()` call passes correct direction vectors regardless of camera altitude

### 3.5: Update cloud shadow renderer for altitude

**File**: `packages/rewild-renderer/lib/renderers/sky/CloudShadowRenderer.ts`
**File**: `packages/rewild-renderer/lib/shaders/cloudShadow.wgsl`

- [ ] The shadow map renderer marches rays through the cloud layer from the sun's perspective. Verify that the shadow shader's sphere intersection is altitude-independent (it should be — the ray origin is the sun-view texel position, not the camera)
- [ ] However, the shadow map center follows the camera XZ. When the camera is above clouds, shadow coverage may need adjustment — verify this edge case works

### 3.6: Add `cameraAltitude` uniform

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] While the shader can compute altitude from `cameraPosition`, it's cleaner to provide `cameraAltitude` as a pre-computed uniform for branching:
  ```typescript
  // In uniform buffer update:
  const cameraAltitude = camera.position.y; // Or length from earth center
  ```
- [ ] This also enables CPU-side decisions like "reduce post-processing when inside clouds" or "disable god rays when inside clouds"

### 3.7: Add altitude transition smoothing

- [ ] At the boundary between "below" and "inside" clouds (camera crossing `CLOUD_START`), there can be a visible pop as the rendering mode switches. Add a small transition zone (e.g., 50 units) where the two modes blend:
  ```wgsl
  let transitionZone = 50.0;
  let belowBlend = smoothstep(ATM_START - transitionZone, ATM_START, camHeight);
  let aboveBlend = smoothstep(ATM_END, ATM_END + transitionZone, camHeight);
  ```
- [ ] This prevents visual discontinuities at the exact boundary
- [ ] Similarly, smooth the transition at the top boundary (inside → above)

## Acceptance Criteria

- [ ] Can fly smoothly from ground level up to 10km+ with no visual artifacts
- [ ] Below clouds (500m): renders identically to current implementation (no regression)
- [ ] Entering clouds (~1200m): smooth fade into fog, cloud detail visible at close range
- [ ] Inside clouds (1200-1800m): fog effect, short-range cloud detail, reduced sample count
- [ ] Exiting above clouds (~1800m): smooth transition, clouds visible below
- [ ] Above clouds (3000m+): cloud layer visible from above, looks down at cloud tops
- [ ] Very high altitude (10km+): cloud layer is a distant blanket below
- [ ] No visual popping or hard cuts at any altitude transition boundary
- [ ] Performance maintained or improved:
  - Below clouds: same as before
  - Inside clouds: faster (~2x) due to fewer samples + short rays
  - Above clouds: similar to below
- [ ] Works correctly at all times of day (sunrise, sunset, night)
- [ ] Horizon line correct at all altitudes
- [ ] Cloud shadows (Phase 2) still work when camera is above clouds

## Testing Checklist

Test these camera positions systematically:

| Altitude | Position              | Directions to test    | Expected behavior                       |
| -------- | --------------------- | --------------------- | --------------------------------------- |
| 500m     | Ground                | Look up               | Same as current (clouds in sky)         |
| 1100m    | Just below cloud base | Look up, horizontal   | Clouds visible above and at horizon     |
| 1200m    | Cloud base            | Look all dirs         | Transition into fog begins              |
| 1500m    | Middle of layer       | Look all dirs         | Dense fog, close cloud detail           |
| 1800m    | Cloud top             | Look down, horizontal | Transition out of fog, cloud tops below |
| 3000m    | Well above            | Look down             | Cloud layer visible as surface below    |
| 10000m   | Very high             | Look down             | Distant cloud blanket                   |

For each position, also test:

- [ ] Rotate camera 360° — no artifacts at any angle
- [ ] Move camera slowly through — smooth transitions
- [ ] Move camera quickly through — no frame-delayed artifacts
- [ ] Day, sunset, night lighting at each altitude

## Performance Budget

| Scenario                 | Expected frame cost                           |
| ------------------------ | --------------------------------------------- |
| Below clouds (no change) | Same as baseline                              |
| Inside clouds            | ~50% of baseline (fewer samples, short rays)  |
| Above clouds             | ~80-110% of baseline (similar ray lengths)    |
| Transition zones         | ~90% of baseline (blending adds minimal cost) |

## Debugging

- [ ] Add a debug overlay showing:
  - Current camera altitude (absolute and relative to cloud layer)
  - Current rendering mode: "BELOW" / "INSIDE" / "ABOVE"
  - Ray start/end `t` values
  - Sample count being used
- [ ] Suggest binding this to a debug key (e.g., `F3`) or an existing debug panel

## Known Risks

1. **`intersectSphere()` edge cases**: Rays tangent to the sphere shell may produce degenerate `tStart ≈ tEnd` ranges. The `tStart >= tEnd` guard handles this, but test with the camera exactly at `CLOUD_START` altitude
2. **Shader branching**: Divergent branches (below vs inside vs above) may reduce GPU parallelism. In practice, all pixels in a frame share the same camera altitude, so all threads take the same branch — this should not be an issue (uniform branching is fast)
3. **Cloud shadow alignment**: When inside/above clouds, the shadow map still works from the sun's perspective. But ensure the shadow sampling in terrain materials uses world position, not camera-relative coordinates

## Rollback Strategy

The altitude fix modifies `skyRay()` in place. To revert:

1. Restore the original sphere intersection logic in `skyRay()` (Case 1 only)
2. Remove the `isInsideClouds` fog effect
3. Remove the `cameraAltitude` uniform (optional — it's harmless to leave)
4. Remove transition smoothing

Since this is a pure shader change, rollback is a single file revert of `clouds.wgsl` plus removing the new uniform.

## Files

| Action | Path                                                                                   |
| ------ | -------------------------------------------------------------------------------------- |
| Modify | `packages/rewild-renderer/lib/shaders/atmosphere/clouds.wgsl`                          |
| Modify | `packages/rewild-renderer/lib/shaders/atmosphere/atmosphere.wgsl`                      |
| Modify | `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`                            |
| Modify | `packages/rewild-renderer/lib/shaders/cloudShadow.wgsl` (verify altitude-independence) |

## Labels

`enhancement`, `renderer`, `sky`, `clouds`
