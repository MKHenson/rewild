# Phase 5: Performance Optimization — Temporal Reprojection & Dynamic LOD

## Summary

Dramatically reduce the per-frame cost of cloud rendering by reusing data from previous frames (temporal reprojection) and scaling sample counts based on importance (dynamic LOD). The target is a 2-4x reduction in cloud rendering cost — from ~4-6ms down to ~1-2ms per frame.

## Motivation

Cloud raymarching is the single most expensive pass in the sky rendering pipeline. Each frame currently fires 80 sample rays per pixel across ~830k pixels (for 0.8x resolution at 1080p). Temporal reprojection amortizes this over 16 frames — each frame only raymarches 1/16 of the pixels and reuses the other 15/16 from history. Combined with LOD scaling (fewer samples for distant/peripheral pixels), this can bring the cloud pass well within the budget for 120 FPS.

## Prerequisites

- **Phase 0** completed (GPU Performance Monitor needed for measuring improvements)
- **Phase 1-3** completed (stable cloud rendering at all altitudes)
- **Phase 4** recommended (god rays — temporal clouds affect the transmittance input)

## Architecture

### Temporal Reprojection

```
Frame N-1                          Frame N
┌─────────────────────┐           ┌─────────────────────┐
│ History Texture     │───────────│ Reproject history    │
│ (full quality)      │  camera   │ to current frame     │
└─────────────────────┘  motion   └──────────┬───────────┘
                         vectors             │
                                   ┌─────────▼──────────┐
                                   │ Update 1/16 pixels  │
                                   │ (fresh raymarch)     │
                                   └─────────┬───────────┘
                                             │
                                   ┌─────────▼──────────┐
                                   │ Blend history +     │
                                   │ new samples         │
                                   │ → new History       │
                                   └─────────────────────┘
```

Each frame, pixels are assigned to one of 16 groups via a 4×4 checkerboard pattern. Only one group is raymarched fresh each frame. The other 15 groups reproject their previous-frame value using the camera's motion. When reprojection fails (disocclusion, camera rotation too large), those pixels fall back to a low-quality raymarch.

### Dynamic LOD

```
┌────────────────────────────────┐
│          Screen                │
│    ┌──────────────────────┐   │
│    │  Center: 80 samples  │   │
│    │  Mid:    48 samples  │   │
│    └──────────────────────┘   │
│  Edges: 24 samples            │
└────────────────────────────────┘
```

Sample count scales based on:

- Distance from screen center (peripheral pixels need less detail)
- Ray length (distant clouds need fewer samples)
- View angle (grazing rays need fewer samples)

## Tasks

### 5.1: Create temporal reprojection system

**New file**: `packages/rewild-renderer/lib/renderers/sky/TemporalCloudRenderer.ts`

- [ ] Create class managing the temporal reprojection pipeline:

  ```typescript
  export class TemporalCloudRenderer {
    historyTexture: GPUTexture; // Previous frame's clouds (full quality)
    currentTexture: GPUTexture; // This frame's output (blend of history + new)
    reprojectionPipeline: GPURenderPipeline;
    blendPipeline: GPURenderPipeline;
    uniformBuffer: GPUBuffer;

    currentFrame: number = 0; // Cycles 0-15 for checkerboard pattern
    historyValid: boolean = false; // False on first frame or after camera jump

    prevViewProjMatrix: Float32Array; // Previous frame's view-projection matrix
  }
  ```

- [ ] Create two textures at cloud render resolution (same format as current `cloudsPass.renderTarget`):
  - `historyTexture` — the accumulated result from all previous frames
  - `currentTexture` — this frame's output (becomes next frame's history)
- [ ] Create uniform buffer for temporal data:
  - `prevViewProjMatrix: mat4x4<f32>` — for reprojecting world positions to previous-frame UVs
  - `currentViewProjMatrix: mat4x4<f32>`
  - `invCurrentViewProjMatrix: mat4x4<f32>` — for reconstructing world position from depth/UV
  - `currentSampleIndex: u32` — which 1/16 group to update (0-15)
  - `historyValid: u32` — boolean flag
  - `blendFactor: f32` — how much to trust history (0.9 = stable, 0.5 = responsive)

### 5.2: Modify cloud shader for temporal rendering

**New file**: `packages/rewild-renderer/lib/shaders/cloudsTemporal.wgsl`

- [ ] This is a variant of the cloud shader that conditionally raymarches based on the pixel's temporal group:

  ```wgsl
  @fragment
  fn fs(@builtin(position) fragCoord: vec4<f32>, ...) -> @location(0) vec4<f32> {
    // Determine which temporal group this pixel belongs to (4×4 checkerboard)
    let pixelGroup = (i32(fragCoord.x) % 4) + (i32(fragCoord.y) % 4) * 4;

    if (pixelGroup == i32(uniforms.currentSampleIndex)) {
      // This pixel's turn — do full quality raymarch
      return skyRay(cameraPos, dir, sun_direction);
    }

    // Not this pixel's turn — reproject from history
    let worldPos = reconstructWorldPos(fragCoord.xy, uniforms.invCurrentViewProjMatrix);
    let prevClip = uniforms.prevViewProjMatrix * vec4f(worldPos, 1.0);
    let prevUV = (prevClip.xy / prevClip.w) * 0.5 + 0.5;

    // Validate reprojection
    if (isReprojectionValid(prevUV, dir)) {
      return textureSample(historyTexture, linearSampler, prevUV);
    } else {
      // History invalid — disocclusion detected
      // Fall back to low-quality raymarch (1/4 samples)
      return skyRayLowQuality(cameraPos, dir, sun_direction);
    }
  }
  ```

- [ ] **Reprojection validity check**: A reprojected sample is invalid when:
  - `prevUV` is outside [0, 1] (pixel was off-screen last frame)
  - The reprojected direction diverges too much from the current direction
  - Cloud motion (wind) has moved the clouds significantly since the history was written
- [ ] **Low-quality fallback** `skyRayLowQuality()`: Same as `skyRay()` but with `NUM_CLOUD_SAMPLES / 4` samples. This is used for disoccluded pixels that can't use history — it's cheaper than full quality but avoids black holes
- [ ] For clouds specifically, world-position reprojection may not work perfectly because clouds are volumetric (no single depth). An alternative is **direction-based reprojection**: instead of reprojecting a world point, reproject the _ray direction_ and sample the history by matching directions. This is simpler for sky rendering and avoids depth reconstruction. Consider both approaches and implement whichever is more stable:
  ```wgsl
  // Direction-based: simpler for sky
  let prevDir = (uniforms.prevInvViewMatrix * vec4f(dir, 0.0)).xyz;
  let prevUV = directionToUV(prevDir); // Spherical mapping or similar
  ```

### 5.3: Create reprojection blend pass

- [ ] After the temporal cloud shader produces the mixed output (1/16 fresh + 15/16 reprojected), blend it with the history using an exponential moving average:

  ```wgsl
  // Blend pass
  let current = textureSample(currentCloudTexture, sampler, uv);
  let history = textureSample(historyTexture, sampler, uv);

  // Exponential blend: favor history for stability, mix in new data
  let blendFactor = select(0.1, 1.0, !uniforms.historyValid);
  let result = mix(history, current, blendFactor);
  ```

- [ ] The `blendFactor` controls responsiveness vs stability:
  - `0.05` = very stable, slow to respond to changes (may ghost during fast motion)
  - `0.2` = responsive, converges quickly but may flicker
  - Start with `0.1` (1/10 of current frame blended in each frame = converges in ~10 frames)
- [ ] After rendering, swap: `currentTexture` becomes the new `historyTexture` for next frame (ping-pong)

### 5.4: Handle history invalidation

- [ ] The history must be invalidated (force full re-render) when:
  - First frame after initialization
  - Camera teleports (position change > threshold between frames)
  - Render resolution changes
  - Cloud parameters change discontinuously (e.g., cloudiness slider jumped)
- [ ] Track `prevCameraPosition` and `prevCameraRotation` to detect teleports:
  ```typescript
  const positionDelta = camera.position.distanceTo(this.prevCameraPosition);
  const rotationDelta = camera.quaternion.angleTo(this.prevCameraQuaternion);
  if (positionDelta > 100 || rotationDelta > Math.PI / 4) {
    this.historyValid = false;
  }
  ```
- [ ] When history is invalid, set `blendFactor = 1.0` for one frame (use only current data)
- [ ] `historyValid` resets to `true` on the next frame after a full render

### 5.5: Wire temporal renderer into `SkyRenderer`

**File**: `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`

- [ ] Replace `cloudsPass.render()` with `temporalCloudRenderer.render()` (or wrap it)
- [ ] The temporal renderer internally calls the cloud shader — it replaces how `cloudsPass` is invoked, not the cloud shader logic itself
- [ ] The output texture (`temporalCloudRenderer.currentTexture`) feeds into the same downstream passes (bloom, TAA, final composite) that currently consume `cloudsPass.renderTarget`
- [ ] Store `prevViewProjMatrix` at the end of each frame for next frame's reprojection:
  ```typescript
  // At end of render()
  this.temporalCloudRenderer.prevViewProjMatrix.set(
    camera.viewProjectionMatrix
  );
  this.temporalCloudRenderer.prevCameraPosition.copy(camera.position);
  ```

### 5.6: Implement dynamic LOD system

**Modification to**: `packages/rewild-renderer/lib/shaders/atmosphere/clouds.wgsl` (or `cloudsTemporal.wgsl`)

- [ ] Add LOD calculation function:

  ```wgsl
  fn calculateCloudLOD(fragCoord: vec2<f32>, dir: vec3<f32>, rayLength: f32) -> f32 {
    // Screen-space LOD: edge pixels need less detail
    let screenCenter = vec2<f32>(uniforms.resolutionX, uniforms.resolutionY) * 0.5;
    let distFromCenter = length(fragCoord - screenCenter) / length(screenCenter);
    let screenLOD = smoothstep(0.3, 1.0, distFromCenter);

    // Distance LOD: far-away clouds need fewer samples
    let distanceLOD = smoothstep(1000.0, 5000.0, rayLength);

    // View angle LOD: grazing angles (looking near horizontal) need fewer samples
    let angleLOD = smoothstep(0.3, 0.0, abs(dir.y)) * 0.3;

    return max(screenLOD, max(distanceLOD, angleLOD));
  }
  ```

- [ ] Scale sample count based on LOD:
  ```wgsl
  let lod = calculateCloudLOD(fragCoord.xy, dir, rayLength);
  let numSamples = i32(mix(f32(NUM_CLOUD_SAMPLES), 16.0, lod));
  ```
  At maximum LOD (screen edges, far distances), sample count drops from 80 to 16 — a 5x reduction for those pixels
- [ ] LOD should be applied to both the full-quality raymarching and the low-quality fallback:
  - Full quality: 80 → 16 based on LOD
  - Low quality fallback: 20 → 8 based on LOD

### 5.7: Optional — migrate to compute shader

> **Note**: Only attempt this if render pipeline approach doesn't meet performance targets. Compute shaders add complexity but enable shared memory and direct texture writes.

- [ ] Convert the cloud rendering from a fragment shader (render pipeline) to a compute shader:
  ```wgsl
  @compute @workgroup_size(8, 8, 1)
  fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let uv = vec2<f32>(id.xy) / vec2<f32>(uniforms.resolutionX, uniforms.resolutionY);
    let dir = calculateRayDirection(uv);
    let color = skyRay(uniforms.cameraPos, dir, uniforms.sunDir);
    textureStore(outputTexture, id.xy, color);
  }
  ```
- [ ] Benefits: no rasterization overhead, better workgroup occupancy, can use `var<workgroup>` for shared data
- [ ] Costs: need `GPUTextureUsage.STORAGE_BINDING`, must ensure format supports storage writes (`rgba16float` should work), more complex pipeline setup
- [ ] This is a non-trivial refactor — only pursue if profiling shows the render pipeline overhead is significant

### 5.8: Optional — pre-bake FBM noise to 3D texture

- [ ] Current FBM noise: 3 octaves of procedural noise with matrix multiplication per octave per sample. This is expensive ALU work
- [ ] Alternative: pre-compute FBM into a 64³ or 128³ 3D texture at startup:
  ```typescript
  class FBMTextureGenerator {
    generate(device: GPUDevice, resolution: number = 128): GPUTexture {
      const texture = device.createTexture({
        size: [resolution, resolution, resolution],
        format: 'r8unorm',
        dimension: '3d',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      // Generate noise data on CPU or via compute shader
      // Write to texture
      return texture;
    }
  }
  ```
- [ ] Replace `fbm(p)` calls with texture lookups:
  ```wgsl
  fn fbm(p: vec3<f32>) -> f32 {
    return textureSampleLevel(fbmTexture, linearSampler, p * noiseScale, 0.0).r;
  }
  ```
- [ ] Trade-off: 128³ × 1 byte = 2 MB memory, but eliminates ~50% of the per-sample ALU work
- [ ] Risk: tiling artifacts at the texture boundaries. Mitigate with toroidal/seamless noise generation
- [ ] This can be combined with temporal reprojection for maximum effect

## Acceptance Criteria

- [ ] **No visible ghosting** during normal camera movement (walking, flying)
  - Ghosting = old cloud positions visible as translucent smears when camera moves
  - Acceptable during rapid 180° spins (rejects + fallback handle this)
- [ ] **No visible temporal lag** — clouds appear to update in real-time, not 16 frames behind
- [ ] **Smooth convergence** — when history is invalidated, clouds fill in smoothly over ~10 frames, not in a visible 4×4 checkerboard pattern
- [ ] **Wind animation preserved** — clouds still move naturally with wind
- [ ] **Dynamic LOD invisible** — no visible quality boundary between screen center and edges
- [ ] **Performance target**: cloud rendering < 2ms per frame (down from 4-6ms)
  - Temporal reprojection: 15/16 pixels are cheap texture reads
  - 1/16 pixels: full quality raymarch
  - Total: ~0.5ms (raymarch) + ~0.3ms (reprojection) + ~0.2ms (blend) = ~1ms
- [ ] **Memory budget**: < 100MB additional
  - History texture: ~13 MB (same as cloud render target)
  - Previous frame matrices: negligible
  - Optional FBM texture: 2 MB
- [ ] **History invalidation works**: teleporting camera doesn't produce artifacts

## Performance Validation

Measure with GPU Performance Monitor (Phase 0), before and after:

| Metric                  | Before (Phases 1-4) | Target (Phase 5) | Method         |
| ----------------------- | ------------------- | ---------------- | -------------- |
| Cloud pass total        | 4-6 ms              | 1-2 ms           | Temporal + LOD |
| Atmosphere pass         | 0.5-1 ms            | 0.5 ms           | Unchanged      |
| Post-processing         | 1.5-2 ms            | 1.5 ms           | Unchanged      |
| **Sky system total**    | **7-9 ms**          | **3-4 ms**       | Combined       |
| Frame budget at 120 FPS | 8.3 ms              | 8.3 ms           | —              |
| Sky % of frame budget   | 84-108% (!)         | 36-48%           | —              |

The "before" numbers show why this optimization is critical — the sky system alone nearly consumes the entire frame budget at 120 FPS.

## Testing Checklist

### Temporal Reprojection

- [ ] Static camera: clouds render at full quality, no artifacts
- [ ] Slow camera pan: smooth, no ghosting or smearing
- [ ] Fast camera pan: brief lower quality during rapid motion, recovers within ~10 frames
- [ ] Camera teleport: history invalidated, clouds rebuild smoothly
- [ ] 180° camera spin: worst case — should recover within 16 frames
- [ ] Camera orbit (rotating around a point): smooth reprojection
- [ ] Flying through clouds (Phase 3): reprojection handles altitude changes
- [ ] Resize window: history invalidated and rebuilt

### Dynamic LOD

- [ ] Screen center: full quality, identical to non-LOD rendering
- [ ] Screen edges: slightly softer but no visible boundary
- [ ] Looking straight up: uniform LOD (all pixels similar distance)
- [ ] Looking at horizon: near clouds higher quality, far clouds lower

### Combined

- [ ] Sunrise/sunset: temporal + LOD, smooth color transitions
- [ ] Cloudiness slider: changing cloudiness invalidates history appropriately
- [ ] Wind changes: clouds move naturally, no temporal lag

## Debugging

- [ ] **Checkerboard visualization**: Toggle to show which pixels got fresh raymarches this frame (highlight in red). Should show a shifting 4×4 pattern cycling through 16 positions
- [ ] **History age visualization**: Color pixels by how old their history is (green = fresh, red = 15 frames old)
- [ ] **Reprojection failure visualization**: Highlight pixels where reprojection was rejected (disocclusion)
- [ ] **LOD visualization**: Color pixels by their LOD level (green = full quality, red = minimum)
- [ ] **Performance overlay**: Show ms breakdown: reprojection, fresh raymarch, blend

## Known Risks

1. **Temporal ghosting**: The biggest risk. If the blend factor is too high (favoring history too much), fast camera movement shows ghost clouds. Start conservative (`blendFactor = 0.15`) and tune down
2. **Checkerboard pattern visibility**: If the 4×4 pattern is visible (especially during convergence), add a spatial blur pass that blends neighboring pixels. This costs ~0.1ms but hides the pattern
3. **Cloud animation mismatch**: The wind moves clouds between frames. If the history doesn't account for cloud motion (only camera motion), reprojected clouds will be slightly wrong. For slow wind this is negligible; for fast wind, consider adding cloud velocity to the reprojection
4. **History ping-pong bugs**: Swapping history/current textures each frame is error-prone. Verify the texture references are correct and not accidentally reading from the same texture being written to
5. **Compute shader format support**: Not all WebGPU implementations support `rgba16float` as a storage texture format. Check `GPUAdapterInfo` for `bgra8unorm-storage` and similar features. Fragment-shader approach doesn't have this limitation

## Implementation Order

Recommended order within this phase (can stop at any point if targets are met):

1. **Dynamic LOD** (task 5.6) — lowest risk, immediate benefit (~1.5-2x speedup alone)
2. **Temporal reprojection** (tasks 5.1-5.5) — highest benefit but most complex
3. **FBM texture** (task 5.8) — independent optimization, can be done any time
4. **Compute shader** (task 5.7) — only if still over budget after 1-3

## Performance Fallbacks

If temporal reprojection introduces unacceptable artifacts:

1. Increase `blendFactor` to `0.3` (more responsive, slightly noisier)
2. Reduce temporal groups from 16 to 4 (update 1/4 pixels per frame instead of 1/16)
3. Disable temporal reprojection, keep only dynamic LOD
4. Fall back to full per-frame raymarching (pre-Phase-5 behavior)

## Rollback Strategy

Temporal reprojection is a wrapper around the existing cloud renderer:

1. Remove `TemporalCloudRenderer` and restore direct `cloudsPass.render()` calls in `SkyRenderer`
2. Revert cloud shader to non-temporal variant
3. Keep dynamic LOD changes (they're purely beneficial, no rollback needed)
4. Delete `cloudsTemporal.wgsl` and `TemporalCloudRenderer.ts`

The existing cloud rendering pipeline is untouched underneath — temporal is layered on top.

## Files

| Action            | Path                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| Create            | `packages/rewild-renderer/lib/renderers/sky/TemporalCloudRenderer.ts`         |
| Create            | `packages/rewild-renderer/lib/shaders/cloudsTemporal.wgsl`                    |
| Modify            | `packages/rewild-renderer/lib/shaders/atmosphere/clouds.wgsl` (LOD additions) |
| Modify            | `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`                   |
| Create (optional) | `packages/rewild-renderer/lib/utils/FBMTextureGenerator.ts`                   |

## Labels

`enhancement`, `renderer`, `sky`, `performance`, `optimization`
