# Sky Rendering System

## Overview

Atmospheric rendering system for the Rewild engine supporting realistic sky/clouds at 120 FPS on RTX 3080+. The system combines volumetric cloud raymarching with cached night sky, cloud shadows, and god rays effects.

## Core Architecture

**Main Components:**

- **SkyRenderer** — Orchestrator managing all passes
- **CloudsRenderer** — Volumetric raymarched clouds
- **AtmosphereRenderer** — Sky gradient + night sky sampling
- **Post-processing** — Bloom → final composition
- **Performance monitor** — GPU timestamp profiling (dev tool)

## Key Technical Decisions

**Night Sky**: Baked to 1024×1024×6 rgba16float cubemap at init

**Cloud Shadows**: Cascaded shadow map approach — 1024×1024 density map, orthographic projection from sun, updates every few frames

**Altitude Handling**: Three cases (below/inside/above clouds) with adaptive sample counts — fewer samples when inside clouds (30% reduction)

**God Rays**: Quarter-res radial blur toward sun with cloud transmittance masking — disabled at night

**Performance Monitoring**: GPU timestamp queries exposed via console API (`startSkyPerfCapture()` / `stopSkyPerfCapture()`) — zero overhead when off

## Performance Budget

**Target**: < 8.3ms/frame @ 1920×1080 for 120 FPS
**Future target** 1-2ms clouds, 3-4ms total sky

## Tuning & Debugging

**Console profiling** (browser DevTools):

```js
startSkyPerfCapture(); // Enable GPU timing
stopSkyPerfCapture(); // Disable
```
