# Sky Rendering System

## Overview

Atmospheric rendering system for the Rewild engine supporting realistic sky/clouds at 120 FPS on RTX 3080+. The system combines volumetric cloud raymarching with cached night sky, cloud shadows, and god rays effects.

## Core Architecture

**Main Components:**

- **SkyRenderer** — Orchestrator managing all passes
- **CloudsRenderer** — Volumetric raymarched clouds
- **AtmosphereRenderer** — Sky gradient + night sky sampling
- **SkyCubeCapture** — Atmosphere rendered to a cubemap for image-based lighting
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
straddle two different skies. Consumed by the IBL prefilter — see
[Lichen](./milestones/lichen.md) phase 4.

**Performance Monitoring**: GPU timestamp queries exposed via console API (`startSkyPerfCapture()` / `stopSkyPerfCapture()`) — zero overhead when off

## Performance Budget

**Target**: < 8.3ms/frame @ 1920×1080 for 120 FPS
**Future target** 1-2ms clouds, 3-4ms total sky

## Tuning & Debugging

**Console profiling** (browser DevTools):

```js
startSkyPerfCapture(); // Enable GPU timing
stopSkyPerfCapture(); // Disable

showIblCubes(); // Draw the captured sky faces along the bottom of the screen
hideIblCubes();
setIblCubeExposureBias(8); // Open up a night capture; 1 matches the frame
skyCaptureStats(); // Faces pending, faces/frame, next face
setSkyCaptureEnabled(false); // Stop capturing entirely
```

The cube viewer applies `Camera.exposure` and the same ACES curve as
`frame-compositing/tonemap.wgsl`, with no gamma encode — the swapchain is plain `bgra8unorm` and
the frame tonemap does not encode either. A tile should therefore read like the sky above it; if
it does not, the capture is wrong rather than the viewer.

`sky-cube-capture` in the perf capture times **one** face, so multiply by the faces drawn that
frame. It reads zero on frames where the sky did not move.
