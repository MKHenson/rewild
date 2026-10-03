# Weather System

The weather has two halves. The **atmosphere system** (`AtmosphereSystem`, in `rewild-renderer/lib/atmosphere`) runs the day/night cycle and decides the weather. The **sky** (`SkyRenderer`) draws it through three subsystems: overcast sky response, precipitation (rain/snow particles), and lightning. The sky's knobs are properties on `SkyRenderer`; while the atmosphere system runs, it writes them at the top of every frame.

---

## Atmosphere System

The Sky's **Dynamic Day & Weather** switch turns it on, in the editor and in the game. The Sky's knobs are where it starts: the sun elevation, the wind direction and the five weather knobs. **Starting Weather** picks the first state, or `Auto` for the state whose middle looks most like the knobs. Any edit to the Sky restarts it from the knobs. `applyAtmosphere` (`src/core/AtmosphereSync.ts`) does this for the game loader and the editor.

`Sky` owns it as `renderer.sky.atmosphere`. Each frame `Sky.update` calls `atmosphere.update(dt)` and copies the sample to the `SkyRenderer` before anything reads the wind.

### Day/night cycle

`DayNightCycle` moves the sun elevation, in degrees and unwrapped: 0 to 180 is day, 180 to 360 night.

| Setting | Default | Effect |
| --- | --- | --- |
| `cycleSeconds` | 300 | One full day and night. |
| `dayShare` | 0.5 | The part of the cycle the sun is up. The sun crosses the sky and the night at different speeds. |
| `paused` | false | Holds the sun. The weather continues unless `weatherPausesWithCycle`. |
| `timeScale` | 1 | Scale on the sun's speed only. |

The start is the Sky's elevation. Tune with `setDayCycle` (see [Debug Commands](./debug-commands.md#day-night--weather)).

### Layers

1. **Climate profile** (`ClimateProfiles.ts`). One per world, picked by the terrain climate preset's `weather` field: `default` is temperate, `arid` is arid. It scales the driver ranges, weights the transitions, and sets the derivation constants, the wind's wander and the variation scale.
2. **State machine** (`WeatherStates.ts`). Eight states: `Clear`, `Fair`, `Overcast`, `Mist`, `FrontApproaching`, `Rain`, `Storm`, `Clearing`. Each gives a range for each driver, a duration in day cycles and weighted transitions. Only `FrontApproaching` and `Rain` lead to `Storm`, so every storm builds. `Mist` is likely at dawn; `Storm` more likely in the afternoon by the climate's `afternoonStormBias`.
3. **Drivers.** `pressure`, `moisture` and `instability`, 0 to 1, ease toward targets inside the state's ranges. The targets wander inside the ranges at the state's retarget interval.
4. **Knobs** (`WeatherDerivation.ts`). Cloudiness, windiness, precipitation, fog and temperature are derived from the drivers each tick, then each follows at its own rate: wind fast, clouds and rain medium, fog and temperature slow. The wind rises with the rate of pressure change, so it rises before a front's rain.
5. **Wind direction.** See below.
6. **Variation.** See below.
7. **Modifiers** (`AtmosphereModifiers.ts`). Temporary changes from gameplay (`addModifier`, `setModifierWeight`, `removeModifier`): `set`, `add`, `multiply`, `min` or `max` on a knob, faded by a weight, lowest priority first. They change the output only, so the weather continues beneath.

Weather time is counted in day cycles: a longer cycle gives longer weather. At the default 5-minute cycle, calm states last 2 to 6 minutes, rain and storms 1 to 4, and fronts under a minute and a quarter, so a calm spell can outlast a day. The seed is the world's terrain seed, and the same seed and start give the same sequence of states. The system keeps the next states picked in advance, so `forecast(n)` is always what comes.

### Wind direction

The wind's bearing is degrees the air moves toward (0 = +x, 90 = +z), as `SkyRenderer.windBearing`.

- **Prevailing wind.** It starts at the Sky's wind direction. On each new state it picks a new bearing up to the climate's `prevailingWander` (40°) either side of the start, and turns to it over about two cycles.
- **Fronts.** Each state turns the wind from the prevailing bearing by its `bearingOffset`. Ahead of a front the wind backs 20° to 60°; behind it (`Clearing`) it veers 40° to 90°. The fronts turn the wind in under a minute; other states over about two minutes.
- **Swings.** The variation layer adds the short swings on top.

### Variation

A state does not hold still. Each state's `variation` sets:

- **Wander.** The most each knob and the bearing strays from the weather. Each strays on its own smooth curve that turns every few seconds to a minute. Rain wanders only where it falls, so a drizzle rises and falls but a dry sky stays dry.
- **Bursts.** Short events at random intervals: the wind swings by a bearing either way and strengthens, and the rain lashes harder, then they settle. `Storm` swings 35° to 80° for 5 to 14 s every 15 to 45 s. The other states have smaller ones: a calm day gusts 10° to 25° for a few seconds about once a minute. `Mist` has none.

Variation runs in seconds and is added after the knobs follow, so a burst arrives at once. A new state's wander fades in over about ten seconds. `climate.variationScale` scales all of it.

### Scripted events

`setEnabled(false)` stops the weather where it is. The script then writes the knobs with `setKnobs({ ..., windBearing })`; modifiers still apply on top. `setEnabled(true)` lets each knob move from where the script left it back to the weather at its normal rate. Disabled time does not count toward the state.

### Moving the world with the wind

Everything the wind moves integrates its own drift each frame (`WindState`), rather than computing direction × time in a shader, so a wind that turns or strengthens moves each field on from where it is:

- `gustDrift`: metres the foliage gust field has blown. Read by the scatter shaders (`windOrigin.zw`), the player's gusts and the lens.
- `cloudDrift`: the cumulus deck's offset, in the sky uniform and the cloud shadow map.
- `cirrusScroll` and `upperDirection`: the cirrus scrolls along the upper air's direction, which turns toward the surface wind over about a minute, so the cirrus does not swing with each gust.

---

## Key Files

| File                                                                | Role                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/rewild-renderer/lib/atmosphere/AtmosphereSystem.ts`       | Day/night cycle, weather states, wind direction, variation   |
| `packages/rewild-renderer/lib/renderers/sky/WindState.ts`           | The wind as things read it, and the drifts it integrates     |
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
| `temperature`   | `number`  | 0–1        | 0 = snow, 1 = rain; blends particle behavior. Also gates lightning (requires > 0.3) |

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

**Wet surfaces** (`RainWetness`): rain darkens porous surfaces and glosses level ones, building while it falls and drying after. `SkyRenderer.rainWetness` carries it to every lit material through `IblParams.rain`. See [Rain on surfaces](./milestones/pelagic.md#rain-on-surfaces).

---

## Lightning (LightningController + LightningBoltPass)

### LightningController

Owns the strike state machine and bolt path generation. No GPU resources.

**State machine per strike:**

```
IDLE → BOLT (150ms) → FLASH (80ms) → FADE (100ms) → IDLE
```

Lightning only fires when `cloudiness > 0.85`, `precipitation > 0.8`, and `temperature > 0.3` (a thunderbolt in a snowstorm looks wrong). Strike frequency scales with `cloudiness × precipitation`. Chain strikes: up to 2 follow-up bolts at 40% chance each.

The bolt path is generated via **fractal subdivision** (4 levels, 2–3 branches) using pre-allocated ping-pong buffers — zero per-frame allocation.

Key output via `currentStrike: LightningStrike`:

- `flashIntensity` — drives the flash's light (`LightningFlash`) and the clouds' glow
- `boltVisible` — whether the bolt geometry pass should run
- `boltPath` / `boltBranches` — world-space point arrays for rendering

### LightningBoltPass

Converts the `LightningStrike` path arrays into billboard triangle strips and renders with additive blending. Fog-attenuated. Fully skipped (zero GPU cost) when `boltVisible = false`.

### Flash Effects

`SkyRenderer.flash` (`LightningFlash`) turns `flashIntensity` into light on the world each frame.

**Flicker.** A flash is several strokes down one channel, so its light pulses rather than blinking once. When the strike's flash begins, `LightningFlash` lays out one to four strokes: the first at full strength, each later one 0.06 to 0.2 s after the last at 35% to 90% of it. A stroke rises in about 12 ms and falls by e every 70 ms. Under them the clouds hold an afterglow at 22% of the first stroke, fading by e every 0.35 s, so the light lingers for about a second (`flickerLight`). The light, the sky, the glare, the clouds' own glow and the composite all follow it.

1. **Light from the bolt.** A directional light from the strike toward the camera, in a cool white, 60 at a full flash (the sun is 120). It is light type 3: directional, but the sun's cloud and cascade shadows do not fall on it, as they point the sun's way. Faces turned to the bolt light up, and wet ground glints. It is hidden between strikes, so it costs nothing then.
2. **The lit cloud deck.** The clouds' own glow (`lightningBoost` in the sky uniform), and a radiance of 12 over the upper half of the sky added to every material's ambient and reflections (`IblParams.flash`, `flashIrradiance` and `flashRadiance` in `ibl.wgsl`). The sky cubes are captured too slowly to catch a flash, so it is added on top of them.
3. **Glare.** A little white over the screen after the tone curve, as the eye is dazzled: 0.15 at a full flash with the bolt straight ahead, none with it abeam or behind.

`setLightningFlash({ light, sky, glare, linger })` tunes them in the console, `linger` stretching the flicker (2 lasts twice as long); `triggerLightning([x, y, z])` fires a strike.

---

## Render Pipeline Order

```
Cloud Shadow Map
    → Temporal Clouds (TemporalCloudRenderer)
    → Atmosphere / Sky Gradient (overcast applied)
    → Blur → Bloom → God Rays → Bilateral Filter
    → Final Composite
    → Lightning Bolt   ← postRender, skipped between strikes
    → Rain Particles   ← postRender, sits in front of bolt
```

Weather passes run in `postRender`, after the sky compositor is submitted. The bolt renders before rain so particles sit in front of it.
