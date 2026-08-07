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
See [Materials & Shading (Lichen)](./milestones/lichen.md#ambient-from-the-sky).

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

**Performance Monitoring**: GPU timestamp queries exposed via console API — zero overhead when off

## Performance Budget

**Target**: < 8.3ms/frame @ 1920×1080 for 120 FPS
**Future target** 1-2ms clouds, 3-4ms total sky

## Tuning & Debugging

The sky's console tools — GPU timing capture, the IBL cube viewer, and the switches
that freeze or remove sky ambient — are documented with every other debug command in
[Debugger & Console Commands](./debug-commands.md#sky-ibl), along with what a correct
capture, irradiance row and BRDF map look like.
