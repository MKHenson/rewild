# Weather System

The weather system lives inside `SkyRenderer` and is composed of three subsystems: overcast sky response, precipitation (rain/snow particles), and lightning. All controls are exposed as properties on `SkyRenderer`.

---

## Key Files

| File                                                                | Role                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts`         | Main API — owns all weather state and coordinates subsystems |
| `packages/rewild-renderer/lib/renderers/sky/LightningController.ts` | Strike timing, state machine, bolt path generation           |
| `packages/rewild-renderer/lib/post-processes/LightningBoltPass.ts`  | Renders bolt geometry as billboard triangle strips           |
| `packages/rewild-renderer/lib/post-processes/RainParticlePass.ts`   | GPU particle system for rain and snow (compute + render)     |
| `packages/rewild-renderer/lib/shaders/atmosphere/atmosphere.wgsl`   | Overcast sky gradient and sun disk fade                      |
| `packages/rewild-renderer/lib/shaders/lightningBolt.wgsl`           | Lightning ribbon shader                                      |
| `packages/rewild-renderer/lib/shaders/rainCompute.wgsl`             | Particle physics and respawn compute                         |
| `packages/rewild-renderer/lib/shaders/rainRender.wgsl`              | Particle billboard rendering                                 |

---

## SkyRenderer Weather API

These are the designer-facing properties on `SkyRenderer`. All take effect within one frame (they are uniforms).

| Property        | Type      | Range      | Description                                                  |
| --------------- | --------- | ---------- | ------------------------------------------------------------ |
| `cloudiness`    | `number`  | 0–1        | Cloud coverage. Also gates lightning (requires > 0.85)       |
| `windDirection` | `Vector2` | normalized | XZ direction clouds and precipitation move toward            |
| `windiness`     | `number`  | 0–1        | Wind speed scale; drives gust strength quadratically         |
| `precipitation` | `number`  | 0–1        | Precipitation density. Also gates lightning (requires > 0.8) |
| `temperature`   | `number`  | 0–1        | 0 = snow, 1 = rain; blends particle behavior                 |

**Read-only / triggering:**

```typescript
skyRenderer.lightningFlashIntensity  // current flash brightness (0–1), read each frame
skyRenderer.triggerLightning(worldPos?) // manually trigger a strike
```

---

## Overcast Sky Response

Implemented in `atmosphere.wgsl`. When `cloudiness` exceeds ~0.5, an `overcastFactor` is derived and applied to:

- Sky zenith and horizon colors — shift toward pale gray-blue
- Sun disk — softer edge, reduced intensity

The effect is gated by sun elevation so the night sky is unaffected.

---

## Precipitation (RainParticlePass)

A GPU compute + render particle system managing **50,000 particles**. Not a screen-space effect — particles exist in 3D world space around the camera.

**Compute pass** (`rainCompute.wgsl`): updates particle positions using velocity and gravity, respawns particles when they exit the spawn volume (60m radius, 40m height by default).

**Render pass** (`rainRender.wgsl`): billboard quads with depth test. Particle appearance blends between rain (streaks, slight blue tint) and snow (round flakes, slow wobble) based on `temperature`. Brightness is tinted by sun elevation — darker at night.

`SkyRenderer` calls `rainPass.simulate()` then `rainPass.render()` each frame, passing current wind, precipitation, and camera data via the `RainParticleParams` struct.

---

## Lightning (LightningController + LightningBoltPass)

### LightningController

Owns the strike state machine and bolt path generation. No GPU resources.

**State machine per strike:**

```
IDLE → BOLT (150ms) → FLASH (80ms) → FADE (100ms) → IDLE
```

Lightning only fires when `cloudiness > 0.85` and `precipitation > 0.8`. Strike frequency scales with `cloudiness × precipitation`. Chain strikes: up to 2 follow-up bolts at 40% chance each.

The bolt path is generated via **fractal subdivision** (4 levels, 2–3 branches) using pre-allocated ping-pong buffers — zero per-frame allocation.

Key output via `currentStrike: LightningStrike`:

- `flashIntensity` — drives screen flash and directional light
- `boltVisible` — whether the bolt geometry pass should run
- `boltPath` / `boltBranches` — world-space point arrays for rendering

### LightningBoltPass

Converts the `LightningStrike` path arrays into billboard triangle strips and renders with additive blending. Fog-attenuated. Fully skipped (zero GPU cost) when `boltVisible = false`.

### Flash Effects

`SkyRenderer` feeds `flashIntensity` into two places each frame:

1. The sky uniform's `lightningFlash` field — used in `atmosphereFinal.wgsl` for a screen-space vignette flash
2. The public getter `lightningFlashIntensity`

---

## Render Pipeline Order

```
Cloud Shadow Map
    → Temporal Clouds (TemporalCloudRenderer)
    → Atmosphere / Sky Gradient (overcast applied)
    → Blur → Bloom → God Rays → Bilateral Filter
    → Final Composite (flash applied)
    → Lightning Bolt   ← postRender, skipped between strikes
    → Rain Particles   ← postRender, sits in front of bolt
```

Weather passes run in `postRender`, after the sky compositor is submitted. The bolt renders before rain so particles sit in front of it.
