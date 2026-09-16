# Debugger & Console Commands

Every debug tool in the engine except the [perf panel](#perf-panel) is a function
on `window`, callable from the browser DevTools console while the app is running. They're registered in `src/core/debug/`
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

`cloudShadows` is the one worth reaching for first on a GPU-bound frame. It sets
the shadow map edge and how many frames apart the rebuilds are, 1024² every 2
frames on `ultra` down to 256² every 6 on `low`, and that pass measures as most
of the sky's GPU cost. Pinning it low while the rest of the sky stays high costs
very little on screen, because the map covers a fixed 5000 m of ground and cloud
shadows are soft at any resolution.

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

Registered in `ChunkSnapshotDevCommands.ts`.

```js
writeChunkSnapshotFixture(cx, cy); // Save an unmistakable plateau and re-mesh in place
clearChunkSnapshots(); // Remove every saved edit for this level and reload
```

Terrain has no timing command of its own. It is not a separate render pass —
its LOD meshes draw through the main scene pass alongside all opaque geometry —
so its cost shows up in the `scene` row of the [perf panel](#perf-panel). Point
the camera at terrain and that row is dominated by terrain's fragment cost.

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
showColliderBands(); // How many scatter instances hold a physics collider, per layer, against the band radii and the budget. Game only
setWindOverride(1, 90); // Force foliage wind: strength 0..1, bearing in degrees the air moves toward (0 = +x, 90 = +z). setWindOverride() follows the weather again
```

A layer's LOD chain is a list of handover distances (`lodDistances` in
`ScatterLayers.ts`): the model draws out to the first, the next mesh from there
to the second, and the last mesh out to the impostor's `fromDistance`, where a
billboard baked off the model takes over to `cullDistance`. The impostor is
always the last tier. Each handover is a cross-fade a few metres wide — the two
tiers either side draw complementary screen-door patterns across it — and the
last tier fades out short of `cullDistance`. `showScatterLodTiers` shows where
those handovers land on screen; the fade shows as a band of mixed tints. `setScatterLodBias(2)` brings the impostor right up to the camera so
its quality can be judged; `setScatterLodBias(-2)` draws the full model to the
cull distance for a before/after on frame time.

`showScatterStats` is for "why is that tree not there". Each row is one draw:
one chunk, one layer, one tier. `drawn` is whether the draw was issued;
`band` is the distance range that tier keeps; `distance` is how far the
viewer was from that chunk's instances when the cull last ran. A chunk with no
rows never generated scatter (see `showScatterChunks`); a row with `drawn:
false` and a `distance` inside its `band` means the cull has not re-run since
the camera moved.

`showColliderBands` reads the physics side. A scatter instance holds a Rapier
collider only while the player is near: it gains one inside the activate
radius, keeps it out to the deactivate radius, and never more than the budget
are resident at once — nearer instances win, and a held collider gets the
band width of grace before a newcomer takes its slot. `active` well under
`candidates` is the point; `active` pinned at `budget` means the forest is
denser than the budget and the furthest colliders are unregistered. Only
layers with a `collider` proxy in `ScatterLayers.ts` count as candidates.

`setWindOverride` is for tuning a layer's wind block and a model's bend
weights without waiting for a storm. Foliage sways by `COLOR_0` — R bend, G
phase, B flutter — along the direction clouds and rain drift. A layer's
`wind` block is tuned for windiness 1; the weather scales all three fields
down from there, and the wind clock runs at the windiness, so a calm day
sways slower as well as less. Gusts are a smooth noise field over world
position blown downwind at the wind's speed and read per vertex, so
neighbours lean together and a crown's upwind side leads its lee — trees
moving independently means the field has lost its world position. A model
without `COLOR_0` stays rigid whatever the layer says; a primitive that
carries it sways in the scene pass and the shadow pass alike, so a shadow
that stays still under moving leaves means the shadow pipeline missed the
variant.

See [Understory](./milestones/understory.md).

---

## Perf panel

Press the backquote key (`` ` ``) in the game or the editor. Press it again to
close. There are no performance console commands: everything they used to print
is a row here.

**Copy** puts the whole panel on the clipboard as plain text, ready to paste into
a bug report or at an LLM. The button works anywhere the cursor does, and `c`
does the same while the panel is open, which is the one that works in game where
pointer lock swallows clicks. The text carries the canvas size, the quality tier
and any per-aspect pins, so a paste says what it was measured on. It also carries
a note explaining the amortised rows, since a reader who does not know that a
periodic pass is averaged will misread it.

The panel is the only reader of `MetricsRegistry`, which every subsystem
publishes into. Adding a number means publishing it from the renderer, not
editing the panel. While the panel is closed the registry is disabled and
records nothing.

**The top line is the verdict.** Frame time, fps, CPU milliseconds spent inside
`Renderer.render()`, GPU milliseconds across every timed pass, and which of the
two is the limit. `vsync capped` means neither is: both have headroom and the
frame is waiting on the display. Shrink the window or find a heavier view before
reading anything into the rest.

**Sections.** `frame` is the wall clock and the CPU total. `gpu · scene`,
`gpu · sky` and `gpu · post` are the render passes, each with its own subtotal.
`cpu · render()` splits the JavaScript side into scene graph, cull, organize and
encode. `counts` holds draw groups, visible solids and shadow casters.

**Every row carries a second number.** Normally it is `max`, the highest single
sample in the two-second window. Read it. A mean hides exactly the spike you are
chasing: a pass costing 9 ms on one frame in two averages to 4.6 and looks
unremarkable.

**Rows that do not run every frame read differently.** Where a pass is periodic
the right-hand number becomes `9.18 @ 1/2`, meaning it cost 9.18 ms on the frames
it ran and runs on one frame in two. The main value stays the amortised cost, so
it is comparable with every other row, and the spike stays visible beside it.
`sky-cloud-shadow` is the one to watch. The cube capture and IBL prefilter run on
their own schedule too.

Two rows still need a caveat. `sky-cube-capture` times **one** face, so multiply
by the faces drawn that frame. `sky-ibl-prefilter` times **one face of specular
mip 1**, the largest unit of prefilter work there is, since every later level
quarters in size.

`no gpu timings` on the verdict line means the adapter has no `timestamp-query`.
CPU rows and counts still work. `settling` means the first 30 frames after a
pipeline rebuild are being discarded, which takes about half a second.

**Sanity check every capture against the frame row.** GPU work is sequential, so
the sum of the GPU subtotals cannot exceed the frame time. If it does, something
is being double counted and the rest of the reading is not safe to act on.

### Attributing the scene pass

Terrain, scatter and everything else all draw through one `renderGroupings` call
inside a single render pass, and a GPU timestamp can only bracket a whole pass.
There is no `terrain` row and there cannot be one without splitting that pass,
which on a tile-based GPU would add a tile store and reload per split and so
change the thing being measured.

Attribution is by ablation instead. Hide a category and read how far the `scene`
row falls:

```js
setSceneCategoryEnabled('scatter', false); // Also drops its shadow cost
setSceneCategoryEnabled('scatter', true);
showAllSceneCategories();
```

Categories are `terrain`, `scatter` and `opaque`, set by `profileCategory` on the
material pass. Hiding one holds it back from **every** pass including shadows,
which is what you want: it answers "what would removing this buy me". Each call
clears the metrics window, so wait for `settling` to clear before reading.

The `counts` section says which category is worth ablating first. A scene with
ten thousand scatter meshes and two hundred of everything else has an obvious
first suspect.

### Why the GPU numbers are not raw durations

`GpuPassTimer` does not report `end - begin` blindly, and the correction matters
enough to know about.

A duration is a pass cost only when the pass has a begin timestamp of its own.
Some backends resolve a pass-boundary write to the start of the whole command
buffer, so several passes in one encoder claim the same start and every
`end - begin` comes out as a running total from that point. Ends stay monotonic
and correct, so when begins repeat the timer takes each cost from the gap to the
previous end instead. This is why `GpuPassTimer.init` must be given its labels in
encode order.

The collapse is usually partial. In `SkyRenderer.render` the first pass keeps its
own begin and the three after it share one. Where begins genuinely are all
distinct the measured durations are used unchanged, and they may sum past the
buffer's wall time, because passes do overlap.

`derivePassCosts` is a pure function and is covered by
`GpuPassTimer.spec.ts` against both real captures.

---

## Adding a command

Put it in a `register*Commands(renderer, project?)` function in `src/core/debug/`
and call it from `index.ts`. Two conventions worth keeping:

- **Print usage when called with no arguments**, including the current value. A
  console command nobody can remember the signature of is a command nobody uses.
- **Validate the arguments.** They arrive from a console having been through no
  type checking at all.

Then add it here.

Performance numbers are the exception: they do not get a command. Add them to the
panel instead.

## Adding a metric

Publish it from wherever it is measured. The panel picks it up with no change of
its own.

```ts
// A CPU span. Declare it in Renderer.declareMetrics so the row order is stable.
metrics.begin('cpu.cull');
// ...work...
metrics.end('cpu.cull');

// A count.
metrics.record('counts.solids', solids.length);
```

For a GPU pass, hand `GpuPassTimer` its labels **in encode order** and pass
`writes(label)` into `beginRenderPass`:

```ts
this.gpuTimer = new GpuPassTimer(renderer.metrics, 'gpu/sky');
this.gpuTimer.init(device, ['clouds', 'atmosphere']);
encoder.beginRenderPass({ ..., timestampWrites: this.gpuTimer.writes('clouds') });
this.gpuTimer.resolve(); // once per frame, after the submits
```

**Calling `writes(label)` counts as encoding that pass**, and that, not the
timings, is where duty comes from. A readback lands a few frames late and only
on about two frames in three, so counting arrivals would report a pass that runs
every frame as running on two in three, and under-report its cost by a third.

So a pass that only runs on some frames must not have its descriptor built on
the frames it sits out. Take a `TimestampWritesFn` and call it inside your own
guard:

```ts
render(encoder: GPUCommandEncoder, timestampWrites?: TimestampWritesFn) {
  if (!this.shouldUpdate()) return; // Before the call, not after.
  encoder.beginRenderPass({ ..., timestampWrites: timestampWrites?.() });
}
```

Evaluating `writes(label)` into the argument list of a method that might return
early is the one way to get this wrong, and it is silent.

Add the group to `GROUP_ORDER` and `GROUP_LABELS` in `PerfPanel.tsx` if it is a
new one. Anything else is picked up automatically.
