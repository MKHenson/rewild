![Foxfire Lighting](../images/foxfire.png)

# Foxfire — Lighting & Soft Shadows Milestone

> Successor to **Mycelium**. Where Mycelium lit up the hidden backend network, _Foxfire_ — the
> bioluminescent glow of fungi on the forest floor — lights up what the player actually sees.

## Overview

The current lighting system is intentionally minimal: a forward renderer with a hard cap of
**4 lights** packed into a uniform buffer (`packages/rewild-renderer/lib/materials/uniforms/Lighting.ts`),
flat Lambert diffuse shading (`shader-lib/total-lighting.frag.wgsl`), and **no geometry shadows** —
the only shadowing is the density-based cloud-shadow map (`renderers/sky/CloudShadowRenderer.ts`).

Foxfire raises the ceiling on lights and gives the world real, soft shadows. It has two pillars:

1. **Expanded forward lighting** — escape the 4-light cap (target ~32 active lights via a storage
   buffer) and add a **spot light** type.
2. **Soft directional + spot shadows** — Cascaded Shadow Maps for the sun with PCF soft filtering,
   plus one shadow-casting spot light, integrated cleanly with the existing cloud shadows.

## Goals

- Render up to **~32 lights per frame** (up from 4) with no per-frame compute overhead. This is a
  render _budget_, not a scene cap — a scene may hold any number of lights; the renderer selects the
  most relevant ~32 each frame.
- Add a **SpotLight** type (cone angle + falloff).
- **Soft shadows** for the directional sun via **3-cascade CSM + PCF**.
- One **shadow-casting spot light** (single perspective shadow map, reusing the PCF path).
- Layer cloud shadows and geometry shadows **physically** on the sun term — geometry shadows stay
  visible under clouds (just dimmer), and shadowed areas are never pure black.
- Stay within a comfortable **WebGPU / browser** performance budget.

## Non-goals (deferred)

- **Forward+ / clustered culling.** Designed for hundreds-to-thousands of lights; at <20 lights the
  per-frame cluster-build compute pass costs more than it saves. Revisit only if light counts grow.
- **PBR / specular shading.** Stays flat Lambert this milestone — a future lighting milestone.
- **Point-light (cube-map) shadows.** Six faces per light; not worth it for the expected scene.
- **Area lights, image-based lighting / ambient GI.**

## Key technical decisions

| Decision           | Choice                                    | Why                                                                                                                                                                         |
| ------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Light culling      | **None — expanded forward**               | <20 lights; looping ~32 lights/fragment is trivial. No compute pipeline.                                                                                                    |
| Light storage      | **Storage buffer**, budget ~32            | Uniform buffer can't scale; storage buffer is dynamically sized and read-only in shaders.                                                                                   |
| Over-budget scenes | **CPU light selection**                   | Sun always kept; remaining slots filled by frustum/range-culled, importance-sorted lights. No GPU compute.                                                                  |
| New light type     | **Spot light**                            | Cheap to add alongside the refactor; the `range` field already distinguishes light types.                                                                                   |
| Sun shadows        | **3-cascade CSM**, sun-only, atlas-packed | Crisp near-field shadows over large terrain; only the sun casts → cost stays bounded.                                                                                       |
| Soft filtering     | **PCF (fixed kernel)**                    | Simplest, cheapest, predictable on web. Shared by directional + spot.                                                                                                       |
| Spot shadows       | **One** shadow-casting spot light         | Single perspective depth map (one frustum), reuses PCF — much cheaper than CSM.                                                                                             |
| Cloud shadows      | **Multiply on the sun term only**         | Cloud transmittance × geometry visibility gate the _direct sun_ sequentially; ambient is untouched so geometry shadows stay visible under cloud and shadows never go black. |

## Architecture sketch

```
collect lights ──▶ Lighting storage buffer (≤32 lights, view-space)  ──▶ fragment loop
                                                                            │
shadow casters ──▶ ShadowPass (depth-only)                                  ├─ per-light diffuse
                    ├─ 3× directional cascades  ─┐                          │
                    └─ 1× spot perspective map  ─┤                          ▼
                                                 └─▶ shadow atlas ─▶ PCF sample ─▶ geom. visibility
                                                                            │
                          cloud-shadow map ──▶ cloud transmittance ─────────▶ × (sun term only) ─▶ final light
```

- **Light data** moves from the fixed uniform struct into a storage buffer; `Lighting.prepare()`
  writes all active lights (view-space) and a `numLights` count.
- A new **ShadowPass** renders shadow casters depth-only: 3 cascades for the sun + 1 perspective
  map for the spot light, packed into a single atlas texture.
- Fragment shaders sample the atlas with a shared **PCF** helper, select the cascade by view depth,
  then multiply the resulting geometry visibility **and** cloud transmittance onto the sun's direct
  contribution only — ambient and other lights are untouched.

## Performance notes (web budget)

- **No per-frame compute** — culling is avoided entirely.
- CSM cost = shadow-caster draw calls × cascades (3). Depth-only passes skip fragment shading.
  Mitigations available if needed: fewer/staggered cascade updates, tighter caster culling, moderate
  atlas resolution (e.g. 2048² split into cascades).
- Only the sun + one spot light cast shadows — shadow cost does **not** scale with total light count.
