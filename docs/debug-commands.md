# Debugger & Console Commands

Every debug tool in the engine is a function on `window`, callable from the browser
DevTools console while the app is running. They're registered in `src/core/debug/`
by `registerDebugCommands()`, which runs wherever a renderer and project are
available — so they repoint at the current scene on every load rather than going
stale.

**Most commands print their own usage when called with no arguments.** If you only
remember half a name, that's the fastest way back in.

This page is the single index of them. The docs for each system describe what it
does; this describes how to look inside it.

---

## Materials & shading

Registered in `PbrHarnessCommands.ts`. Shading has too many places to hide a
mistake — a mis-declared colour space, a flipped normal-map green channel and a
roughness map that never loaded all present as "it looks a bit off". These turn
that into something measurable.

```js
setMaterialChannel('roughness'); // basecolor|metallic|roughness|normal|ao|emissive|direct|indirect
setMaterialChannel('off'); // back to normal shading

showPbrReferenceGrid(); // 7 roughness steps x 3 metallic rows of spheres, 14m ahead
hidePbrReferenceGrid();
```

`setMaterialChannel` covers the standard material, its instanced variant **and
terrain**, so the same channel can be compared across all three. Two of the
channels are outputs rather than inputs: `direct` and `indirect` split the shaded
result by light source, which is the fastest way to tell a sun problem from a sky
one. Input channels are 0–1 quantities pre-divided by exposure so the frame
tonemap passes them through rather than crushing them; the output channels are
left on the scene's own scale so they can be compared against the final image.

**Reading the reference grid.** The highlight should tighten and brighten toward
roughness 0 **without the sphere gaining total energy**; the metal row should take
its colour from what it reflects rather than its albedo; and no sphere should go
black at its rim — that rim is IBL.

The metal row is the sensitive one, because a metal has no diffuse lobe to hide an
energy error behind. It found the first real defect: rough metals were going dark
because the split-sum BRDF only counts a single bounce off a microfacet, and at
high roughness most light bounces several times before leaving. `evaluateIbl` now
adds Fdez-Agüera's multiple-scattering compensation, which returns that energy. If
the right-hand end of the metal row ever goes dark again, that term is the first
thing to check.

See [Materials & Shading (Lichen)](./milestones/lichen.md).

---

## Exposure, bloom & render quality

Registered in `RenderQualityCommands.ts`.

```js
setExposure(0.06); // linear multiplier, not EV stops — see Camera.exposure
setBloom(amount, threshold, maxSource); // uniforms: effective next frame, no rebuild
setRenderQuality('low' | 'medium' | 'high' | 'ultra'); // app-wide tier
```

Exposure is a plain multiplier rather than an aperture/shutter/ISO triple — the
atmosphere's radiance scale is already hand-tuned in absolute terms, and this is
the number it was tuned against. `setRenderQuality` rebuilds the pipelines that
scale with quality, so unlike the bloom knobs it isn't instant.

The tier persists to `localStorage` under `rewild.render.quality` and is restored
on the next load. Default is `high`; `ultra` renders the clouds at full canvas
resolution rather than 0.7x, which is roughly twice the cloud pixels.

### Per-subsystem overrides

Individual subsystems can sit on their own tier — `clouds` (which covers the
bilateral that cleans them up), `cloudShadows`, `godRays` and `bloom`. They are
read through `renderer.quality.aspect('clouds')` rather than `.level`, and stored
separately under `rewild.render.quality.overrides`.

`setRenderQuality` — like the Render Quality dropdown in the settings menu —
clears them all, since the app-wide tier is the coarse control. To set one
without going through the UI:

```js
renderer.quality.setAspect('clouds', 'low');
```

Players reach the same settings from Options on the main menu and Settings in the
in-game menu, which write through `QualitySettings.apply()` so a whole form's
worth of changes costs one rebuild.

---

## Sky IBL

Registered in `SkyDebugCommands.ts`.

```js
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

`setIblEnabled` and `setIblPrefilterEnabled` are different knobs. The first zeroes
the ambient every lit surface receives, which is what separates a direct-lighting
bug from an ambient one. The second stops the cubes being **updated** and leaves
whatever they last held still lighting the scene — useful for checking whether
something is moving because the sky moved.

**Reading the viewer.** The irradiance row should be a smooth gradient with no
visible structure at all, and the specular row **at mip 0 should be identical to
the capture row** — it is a straight copy — then blur monotonically as
`setIblSpecularMip` is stepped up. That identity is the sharpest check available on
the whole chain.

The BRDF map reads red over most of its area with green concentrated in the
top-left. It is vertically flipped against the familiar GL-oriented picture of this
map, because `fragCoord.y` counts down and so roughness 0 is the top row. That is
self-consistent — sampling `vec2f(nDotV, 0)` lands on the row written at roughness
0 — but worth knowing before comparing against a reference image. The BRDF tile
bypasses exposure and tonemapping: it holds dimensionless 0–1 factors, not
radiance.

The cube viewer applies `Camera.exposure` and the same ACES curve as
`frame-compositing/tonemap.wgsl`, with no gamma encode — the swapchain is plain
`bgra8unorm` and the frame tonemap does not encode either. A tile should therefore
read like the sky above it; if it does not, the capture is wrong rather than the
viewer.

See [Sky Rendering](./sky-rendering.md).

---

## Shadows

Registered in `ShadowDebugCommands.ts`.

```js
startShadowDebug(); // Cascade tint: red=0 green=1 blue=2, plus the atlas viewer bottom-left
stopShadowDebug();

setSpotShadowEnabled(false); // The flashlight lights everything it reaches, unshadowed
toggleCloudShadowDebug(); // Report the cloud shadow map's resolution and update rate
```

`setSpotShadowEnabled` exists because a spot's shadow factor is multiplied into the
shaded output — and into the `direct` material debug channel too — so a beam the
shadow map is wrongly rejecting and a beam that never reached the surface look
identical. Turning shadows off leaves the light and takes the map away, which tells
the two apart in one A/B.

See [Lighting (Foxfire)](./milestones/foxfire-lighting.md).

---

## Terrain

Registered in `TerrainPerfCommands.ts` and `ChunkSnapshotDevCommands.ts`.

```js
startScenePerfCapture(); // GPU time per second for the shadow pass and the main scene pass
stopScenePerfCapture();

writeChunkSnapshotFixture(cx, cy); // Save an unmistakable plateau and re-mesh in place
clearChunkSnapshots(); // Remove every saved edit for this level and reload
```

Terrain is not its own render pass — its LOD meshes draw through the main scene
pass alongside all opaque geometry — so `startScenePerfCapture` times that whole
pass. Point the camera at terrain and the `scene` row is dominated by terrain's
fragment cost, which is what the sample-budget measurement watches. The `shadow`
row is the directional shadow pass, all three cascades; scatter draws into both.

`writeChunkSnapshotFixture` exercises the save/load round-trip without the sculpt
UI: it takes the chunk's current heights, presses a smooth plateau into the middle,
persists it through the normal asset path and re-meshes just that chunk — no
reload, neighbours untouched. **`clearChunkSnapshots` deletes real edits** for the
current level, so it is not a command to try casually on a world you care about.

See [Terrain (Strata)](./milestones/strata.md).

---

## Scatter

Registered in `ScatterDebugCommands.ts`.

```js
showScatterStats(); // Table of every scatter draw: chunk, layer, LOD tier, instance count, whether it drew
showScatterChunks(); // Which resident chunks have generated scatter, and against which heights version
setScatterLayerEnabled('oak_01', false); // Hide one layer everywhere; true brings it back
setScatterLodBias(1); // Force every layer one LOD tier coarser; -1 finer; 0 back to normal
showScatterLodTiers(); // Paint each LOD tier a flat colour: green 0, yellow 1, orange 2, red 3+. showScatterLodTiers(false) turns it off
```

A layer's LOD chain is a list of handover distances (`lodDistances` in
`ScatterLayers.ts`): the model draws out to the first, the next mesh from there
to the second, and the last mesh out to the impostor's `fromDistance`, where a
billboard baked off the model takes over to `cullDistance`. The impostor is
always the last tier. `showScatterLodTiers` shows where those handovers land on
screen. `setScatterLodBias(2)` brings the impostor right up to the camera so
its quality can be judged; `setScatterLodBias(-2)` draws the full model to the
cull distance for a before/after on frame time.

`showScatterStats` is for "why is that tree not there". Each row is one draw:
one chunk, one layer, one tier. `drawn` is whether the draw was issued;
`band` is the distance range that tier keeps; `distance` is how far the
viewer was from that chunk's instances when the cull last ran. A chunk with no
rows never generated scatter (see `showScatterChunks`); a row with `drawn:
false` and a `distance` inside its `band` means the cull has not re-run since
the camera moved.

See [Understory](./milestones/understory.md).

---

## Sky performance

Registered in `SkyDebugCommands.ts`. GPU timestamp queries, zero overhead when off.

```js
startSkyPerfCapture(); // Logs a console.table of label → ms once per interval
stopSkyPerfCapture();
```

Two rows need a caveat. `sky-cube-capture` times **one** face, so multiply by the
faces drawn that frame, and it reads zero on frames where the sky did not move.
`sky-ibl-prefilter` times **one face of specular mip 1** — the largest unit of
prefilter work there is, since every later level quarters in size — and likewise
reads zero on frames with no prefilter step scheduled.

---

## Adding a command

Put it in a `register*Commands(renderer, project?)` function in `src/core/debug/`
and call it from `index.ts`. Two conventions worth keeping:

- **Print usage when called with no arguments**, including the current value. A
  console command nobody can remember the signature of is a command nobody uses.
- **Validate the arguments.** They arrive from a console having been through no
  type checking at all.

Then add it here.
