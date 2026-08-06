# Sky Rendering System

## Overview

Atmospheric rendering system for the Rewild engine supporting realistic sky/clouds at 120 FPS on RTX 3080+. The system combines volumetric cloud raymarching with cached night sky, cloud shadows, and god rays effects.

## Core Architecture

**Main Components:**

- **SkyRenderer** — Orchestrator managing all passes
- **CloudsRenderer** — Volumetric raymarched clouds
- **AtmosphereRenderer** — Sky gradient + night sky sampling
- **SkyCubeCapture** — Atmosphere rendered to a cubemap for image-based lighting
- **SkyIblPrefilter** — Irradiance cube, roughness-mipped specular cube and BRDF map
- **Post-processing** — Bloom → final composition
- **Performance monitor** — GPU timestamp profiling (dev tool)

## Key Technical Decisions

**Night Sky**: Baked to 1024×1024×6 rgba16float cubemap at init

**Cloud Shadows**: Cascaded shadow map approach — 1024×1024 density map, orthographic projection from sun, updates every few frames

**Altitude Handling**: Three cases (below/inside/above clouds) with adaptive sample counts — fewer samples when inside clouds (30% reduction)

**God Rays**: Quarter-res radial blur toward sun with cloud transmittance masking — disabled at night

**Sky IBL capture**: 128×128×6 rgba16float cubemap, rendered with the atmosphere pass's own
pipeline pointed at each face by a substituted ray matrix — no shader variant, so the captured
sky cannot drift from the drawn one. Clouds are excluded (raymarching six more views is the one
sky cost that could not be absorbed); cloudiness still greys and dims the capture because the
gradient and fog shaders take it as an input directly. Updates are amortised one face per frame,
restarting whenever the sun, weather or camera altitude moves and idling at zero when they do
not; a discontinuity (slider drag, console setter) redraws all six at once so the faces never
straddle two different skies. Carries a full mip chain, which the prefilter builds and reads.
See [Lichen](./milestones/lichen.md) phase 4.

**Sky IBL prefilter**: turns that capture into the three things a PBR shader can use — a 16×16×6
irradiance cube (cosine-convolved, stored as irradiance/π so it multiplies albedo directly), a
128×128×6 prefiltered specular cube whose mip _m_ holds roughness _m_/7, and a 128×128 `rg16float`
split-sum BRDF map. Specular mip 0 is a straight copy of the capture: roughness 0 is a mirror, and
the GGX estimator degenerates there. Each sample picks a source mip from its pdf, which is what
stops a 64-sample estimate over a sky containing point-like stars from producing fireflies.

Consumed by `shader-lib/ibl.wgsl`, which the standard material calls in place of the flat
`ambientColor` constant it used to add (#201), and which terrain calls too since it adopted the
same PBR include (#202). Diffuse is `irradiance × diffuseColor`; specular is
`prefiltered × (F0 × lut.r + lut.g)`; both are scaled by the occlusion map, since glTF scopes that
to indirect light and this is now the only indirect term. The cubes are world-space and the
material passes shade in view space, so directions are rotated out through the camera's world
matrix, supplied per frame in the IBL params block.

Amortised a **level per frame** — nine steps, so a full pass trails the sky by ~150ms at 60fps.
A pass always runs to completion before the next starts: restarting whenever the capture touched a
face would mean a drifting sun restarts it every frame and it never reaches the end. A
discontinuity is the exception and runs every step in one frame. The BRDF map depends on nothing
but the BRDF, so it is generated once at init and never re-run.

**Performance Monitoring**: GPU timestamp queries exposed via console API (`startSkyPerfCapture()` / `stopSkyPerfCapture()`) — zero overhead when off

## Performance Budget

**Target**: < 8.3ms/frame @ 1920×1080 for 120 FPS
**Future target** 1-2ms clouds, 3-4ms total sky

## Tuning & Debugging

**Console profiling** (browser DevTools):

```js
startSkyPerfCapture(); // Enable GPU timing
stopSkyPerfCapture(); // Disable

showIblCubes(); // Rows bottom-up: capture, irradiance, specular; BRDF map top-right
hideIblCubes();
setIblSpecularMip(3); // Which roughness level the specular row shows (0-7)
setIblCubeExposureBias(8); // Open up a night capture; 1 matches the frame
skyCaptureStats(); // Capture + prefilter schedule state
setSkyCaptureEnabled(false); // Stop capturing entirely

setIblEnabled(false); // Remove sky ambient from shading — isolates direct-light bugs
setIblIntensity(2); // Scale it instead of removing it; 1 is physical
setIblPrefilterEnabled(false); // Freeze the cubes; they keep lighting the scene
```

`setIblEnabled` and `setIblPrefilterEnabled` are different knobs. The first zeroes the ambient
every lit surface receives, which is what separates a direct-lighting bug from an ambient one. The
second stops the cubes being **updated** and leaves whatever they last held still lighting the
scene — useful for checking whether something is moving because the sky moved.

Reading the viewer: the irradiance row should be a smooth gradient with no visible structure at
all, and the specular row **at mip 0 should be identical to the capture row** — it is a straight
copy — then blur monotonically as `setIblSpecularMip` is stepped up. That identity is the sharpest
check available on the whole chain.

The BRDF map reads red over most of its area with green concentrated in the top-left. It is
vertically flipped against the familiar GL-oriented picture of this map, because `fragCoord.y`
counts down and so roughness 0 is the top row. That is self-consistent — sampling
`vec2f(nDotV, 0)` lands on the row written at roughness 0 — but worth knowing before comparing
against a reference image. The BRDF tile bypasses exposure and tonemapping: it holds dimensionless
0–1 factors, not radiance.

The cube viewer applies `Camera.exposure` and the same ACES curve as
`frame-compositing/tonemap.wgsl`, with no gamma encode — the swapchain is plain `bgra8unorm` and
the frame tonemap does not encode either. A tile should therefore read like the sky above it; if
it does not, the capture is wrong rather than the viewer.

`sky-cube-capture` in the perf capture times **one** face, so multiply by the faces drawn that
frame. It reads zero on frames where the sky did not move. `sky-ibl-prefilter` times **one face of
specular mip 1** — the largest unit of prefilter work there is, since every later level quarters in
size — and likewise reads zero on frames with no prefilter step scheduled.
