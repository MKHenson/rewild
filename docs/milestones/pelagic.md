# Pelagic: Water Milestone

> **Draft.** This is a working plan. The decisions and phases can change.
>
> Successor to **Understory**. _Pelagic_ means the open sea, far from any shore. Understory filled
> the land with plants and stones. Pelagic adds the water around and between them.

## Overview

Rewild has no water today. Terrain is an endless, seeded heightfield in chunks of 241 × 241
samples. A climate model (temperature × moisture) picks the biome, and a per-chunk splat map blends
the materials. Scatter grows plants and stones from biome rules.

Pelagic adds oceans and lakes as **one system**. A per-chunk **water map** stores where the water
is, how high its surface is, and what kind of water it is. Oceans and lakes are entries in a
**water palette**, in the same way that grass and rock are entries in the material palette. Water
bodies blend where they meet. For example, a brown lake can flow into a blue sea through a lagoon.

The work has four parts:

1. **World generation.** Sea level, ocean basins, seeded lakes and the water map.
2. **Rendering.** A water surface shader, waves driven by the weather, and shore effects.
3. **Biome and scatter rules.** Beaches, wet shores, coastal moisture and water-aware scatter.
4. **Editor and gameplay.** A water brush, saved water edits and a water query for the player.

The water map comes before the objects milestone for a reason. Water sets where game objects,
paths and goals can go. If objects come first, they must move later.

## Goals

- A world-wide **sea level** and **ocean basins** from a low-frequency continent field.
- **Seeded lakes** that always rebuild the same, with a guaranteed shore around each one.
- **One water map per chunk**, generated in the terrain workers with the splat map.
- A **water palette** with per-type colour, absorption, turbidity, wave style and foam.
- **Smooth blends** between water types, with a surface level that is always continuous.
- A **surface shader**: sky reflection, depth colour, Fresnel, foam and refraction.
- **Waves driven by the weather**. A storm makes the ocean rough and the lake only a little rough.
- **Waves at the shore** that turn toward the beach, foam lines that roll in, and swash.
- **Foam that matches the wind**, from a calm mirror to whitecaps everywhere at full wind.
- **Beaches and wet shores** on the terrain, and **coastal moisture** in the climate.
- **Scatter conditions** for water depth and water type.
- A **water brush** in the editor, with edits saved like other terrain edits.
- **Edit rules** that keep every lake at or below its spill height, so levels stay valid.
- A **water query** for gameplay. The player wades in shallow water and swims in deep water.
- Stay inside the WebGPU and browser performance budget.

## Non-goals (deferred)

- **Rivers with a real drainage graph.** A river must run downhill from a source to an outlet.
  That needs data from far outside the chunk. Noise-channel rivers are a stretch goal (Phase 5).
- **Waterfalls.** A waterfall is a jump in the surface level. The water map does not allow jumps.
- **Screen-space reflections.** Sky reflections from the existing sky cube are enough for now.
- **Buoyancy, boats and floating objects.** These belong to the objects milestone.
- **Tides.** Sea level stays fixed for a world.

## Key technical decisions

| Decision              | Choice                                              | Why                                                                                                                  |
| --------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Water model           | **One per-chunk water map** for every water body    | Oceans and lakes use the same data and shader. They blend where they meet. No special case at the join.              |
| Water types           | **Weights over a water palette**                    | This mirrors the splat and material palette. "60% ocean, 40% lake" is a plain weight blend.                          |
| Surface height        | **Stored in the water map** with a coverage value   | Type weights say what the water looks like. Level says where it is. A blend needs both.                               |
| Level rule            | **Continuous wherever water shows**                 | Two bodies can touch only at the same level. A level can change only where land separates them.                     |
| Wave strength         | **Palette response × weather wind**                 | A storm acts on every water body at once. Nothing extra is saved per texel.                                          |
| Water mesh            | **One shared flat grid per LOD**, drawn per wet chunk | No mesh is generated for a water body. The vertex shader places the grid and reads the chunk's water map.          |
| Shoreline             | **Depth test against the terrain**                  | The water plane covers the whole chunk. Terrain above the level hides it, so the shore is correct for each pixel.    |
| Shore effects         | **Depth from the map**: `level − terrainHeight`     | Foam, shallow colour and wet sand stay stable at low view angles. They do not depend on screen depth.                |
| Terrain height on GPU | **New per-chunk `R16F` height texture**, relative to the chunk's base level | The terrain mesh is built on the CPU, and the GPU has no heights today. Shore effects need them. Relative values keep `f16` precise near the waterline. |
| Lakes                 | **Sparse seeded cells**, one possible lake per cell | Any chunk can compute a lake's shape and level from the seed. It needs no data from other chunks.                     |
| Water bodies          | **Records with an ID**, plus a body ID channel      | Edit rules must know which lake a texel belongs to. The ocean is body 0.                                             |
| Edit rule             | **A lake's level is at most its spill height**      | The editor keeps levels valid with no water simulation. A high lake cannot join the ocean by accident.               |
| Edits                 | **Extend `PaintMask`** plus a float level grid      | One format, one sampler and one brush. It reuses the existing seam fix at chunk edges.                                |
| Waves                 | **FFT ocean**: cascaded JONSWAP tiles, choppy       | A measured sea spectrum with a wind sea and a swell reads as water; a sum of a few waves reads as noise.             |
| Wave queries          | **GPU readback**                                    | The CPU cannot afford the FFT. A few heights per frame arrive a frame or three late, which gameplay tolerates.        |
| Horizon               | **Ocean ring** from the last chunk to the far plane | Chunks stop at 2,800 m. From high ground, the ocean would stop short of the horizon.                                 |
| Render position       | **After opaque geometry, before the atmosphere**    | Water refracts the opaque scene. Fog and sky composite over water in the same way as over terrain.                   |

## The water map

Each chunk gets a water map next to its splat map. The terrain worker builds both from the same
climate and height data.

| Data              | Form                                        | Notes                                                                             |
| ----------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| Surface level     | 1 `f16` channel, relative to the base level | Height of the water surface. Continuous across chunk seams.                       |
| Coverage          | 1 channel, 0 to 1                           | Is there water here? Zero means dry land at any terrain height.                   |
| Type weights      | Weights over the water palette              | Ocean and lake first. Swamp and river later. Weights sum to 1 where coverage > 0. |
| Body ID           | 1 integer channel, nearest sampled          | Which water body owns this texel. 0 is the ocean. Used by the edit rules.         |
| Flow              | 2 channels (direction), optional speed      | Zero for still water. Drives flow-map scrolling, and later, rivers.               |

**Resolution.** Water properties change slowly. The map can use the biome mask's step of 4, which
gives 61² texels per chunk. Neighbouring chunks share their edge texels, so values match at seams.
The fine shoreline comes from the terrain height, not from the map.

**Sampling.** Level, coverage, type weights and flow are sampled linearly. Body ID is an integer
and is always sampled nearest. In a lagoon, the type weights blend but each texel still has one
owner: the lagoon's own ID. The ocean's ID stops where the lagoon's coverage starts.

**Chunk summary.** The water map also holds the **base level** and the highest level in the
chunk. The base level is the lowest water level in the chunk. A chunk where no water shows gets
no water map (`hasWater` is false) and draws no water. Most inland chunks are in this group.

**Terrain heights.** The worker also writes a small `R16F` height texture for each chunk, at the
water map's resolution. The GPU has no terrain heights today, because the terrain mesh is built on
the CPU. The water shader and the terrain shader need them for `level − terrainHeight`.

**Relative heights.** The height texture and the level channel both store `height − baseLevel`.
The shader adds the base level back from a per-chunk uniform. At world heights `f16` is too coarse:
at 1,000 m a step is 0.5 m, so shore foam and the wet band would band. Relative values are small
near the waterline, where precision matters. Far above or below the water, precision drops, but
there the values only need to show "dry" or "deep".

### Water bodies

The water map holds a body ID for each texel. The body itself is a record:

| Field          | Notes                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| `id`           | 0 for the ocean. A generated lake takes its ID from its lake cell coordinate. |
| `level`        | The surface level. For the ocean, this is the world's sea level.             |
| `spillHeight`  | The lowest point of the rim. Calculated, not authored. See [Computing the spill height](#computing-the-spill-height). A generated lake's is its lowest rim sample, a tarn's its lip and a lagoon's sea level. |
| `locked`       | If true, the sculpt brush cannot lower the rim below the level.              |
| `typeWeights`  | The default palette weights for new water in this body.                      |

A generated lake that nobody edits costs nothing to save. The seed builds its record again. Each
chunk's water map carries the records of the bodies that cover it (`WaterMap.bodies`).

**Coverage and the terrain.** Water shows where coverage > 0 **and** `terrainHeight < level`. So
sculpting changes the shore with no change to the water data. Dig a hole in the lake bed and it
fills. Raise an island and the water moves away from it.

**The water palette.** It lives in `ClimateConfig` beside the biomes. Each entry defines:

- Scattering colour and absorption (for Beer-Lambert depth colour).
- Turbidity: how quickly the bed disappears with depth.
- Wave response: how strongly the wind moves this water.
- Wave scale: long ocean swells, or short lake ripples.
- Foam amount and shore foam width.
- Normal-map detail strength.

## World generation

### Oceans

Terrain does not go below a sea level today. Pelagic adds a **continent field**: a very
low-frequency noise that lowers the terrain into ocean basins. The climate model reads it in the
same way as temperature and moisture.

- **Sea level** is one value per world, stored with the world like the seed.
- Coverage for the ocean comes from the continent field, with a soft edge. Inland ground below sea
  level stays dry unless the map says otherwise. See the open questions.
- Terrain inside the basin gets a sea-bed profile: a shelf near the coast, then deeper water.

### Lakes

The world is split into a coarse grid of **lake cells** (`ClimateConfig.lakes`, 1.6 km in the
default climate). The seed decides if a cell holds a lake, and where its centre is. Any chunk can
compute every lake that touches it (`Lakes.ts`):

1. Take the lake centre, a radius and a depth from the cell's hash. The shore wanders from a circle
   by a few sine harmonics with seeded phases.
2. Sample the pre-lake terrain at 24 rim points on the top of the bank. The ground sampler reads the
   un-eroded, uncarved height at any point, so no neighbouring chunk is needed.
3. Set the lake level to the lowest rim height minus a margin. This makes sure that land
   surrounds the water on all sides.
4. Carve the terrain after erosion: a bowl `level − depth·(1 − d²)` inside the shore, rising
   across the bank to the natural ground or the **lip** (`level + margin`), whichever is higher, then
   easing back to the natural ground over the `moraine` beyond the bank. The lip keeps the water in
   wherever the ground between rim samples, or after erosion, dips below the level. Every chunk that
   shares a sample carves it the same way.
5. Write coverage, level, the body ID and the "lake" type weight into the water map. Coverage is
   full to halfway up the bank and fades out at its top. The level reaches a little past the bank,
   so the filtered surface does not sag at the shore.

A lake is rejected when any rim point is within the ocean's coverage. When the spread of its rim
heights, over the rim radius, is steeper than `maxRimSlope`, the site tries a **tarn** instead: a
smaller radius from `tarns.radius`, the rim sampled again, and rejected if steeper than
`tarns.maxRimSlope`. A tarn's level sits `lipShare` of the way up its rim's spread, so it sits in a
cirque with a steep wall uphill, and the lip dams the downhill side. This is how lakes reach the
mountains, which are too steep for a lake anywhere.

**Cells around the chunk.** A lake can reach past its own cell. Its reach, including the bank, is
less than one cell, so a chunk finds every lake by checking the cells that overlap its own bounds
grown by that reach.

**Spacing.** Two lakes at different levels must not overlap, or the level would jump. The banks
of two lakes keep `spacing` apart. When two lakes are too close, the lake with the lower cell hash
is removed. Two reaches are each under a cell, so only cells up to two away can conflict. Every
chunk makes the same choice, because it uses only the seed.

**Scatter and beaches.** Scatter measures water depth from the lake level, so land layers stay out
of lakes and `underwater` layers grow in them. Beaches and the sea bed material follow the ocean
only.

### Where a lake meets the ocean

A lake becomes a **lagoon** when any rim point stands in the sea: below sea level, inside the
ocean's coverage. Coverage alone is not enough, since it reaches a little way over dry land.

- Its level becomes sea level, so the level stays continuous with the ocean.
- It has no lip, and a **mouth** is cut through its bank toward the lowest rim point in the sea: a
  channel 2 m below sea level from just inside the shore to the top of the bank, easing out beyond
  it. Without it the natural beach between the shore and the rim would close the lagoon off.
- Where it and the ocean overlap, the water is one surface: coverage is the larger of the two, and
  the texel belongs to the lagoon while the lagoon covers it. The ocean's ID starts where the
  lagoon's coverage ends.
- Its type weights blend from "lake" out to a fifth of its radius to "ocean" at its shore.

A lagoon's rim slope is judged over its dry rim only, with sea points counted at sea level, against
`maxLagoonSlope`: the sea holds its seaward side. It never falls back to a tarn.

Few seeded centres land just behind a shore, so a share (`lagoonChance`) of the candidates that fall
out at sea **slide ashore** instead of being dropped: up the continent field's gradient, in small
steps, to the first ground a metre above sea level, then back from it by the lake's radius so the
shore lies inside the rim. A slid candidate takes the larger `lagoonRadius`, and settles as a lagoon
or not at all. The slide is decided from the seed and the procedural ground, so every
chunk slides a candidate the same way, and spacing is checked on the moved centres. It moves a
candidate at most `0.4` of a cell, which widens the cells a chunk and the spacing test look at. A candidate whose
centre is below sea level within the ocean's coverage is out at sea, and is dropped.

This is the only way two bodies join. All other lakes sit above sea level inside their own shore.

### Edit rules

A real lake fills until it reaches the lowest gap in its rim. Then it overflows there. That point
is its **spill height**. The editor keeps every lake at or below its spill height. It does not
simulate water.

| Edit                                              | Result                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Lower the rim, and it stays above the level       | No change.                                                                                       |
| Lower the rim below the level                     | The lake **drains** to the new spill height. The level drops and the coverage shrinks.           |
| Cut the rim down to sea level, next to the ocean  | The lake drains to sea level and joins the ocean as a lagoon. Its type weights blend to "ocean". |
| Raise the level with the water brush              | Water spreads by flood fill up to the new level. The level stops at the spill height.           |
| Dig a hole in dry land                            | Nothing fills. Use **Add water** on the water brush to make a new lake.                          |
| Dig below sea level, connected to the ocean       | The trench **fills with sea water**. See [Channels from the sea](#channels-from-the-sea).        |
| Fill in a flooded trench                          | The terrain rises above the level, and the depth test hides the water.                           |
| Raise land inside a lake or the ocean             | An island. See [Islands](#islands).                                                              |
| Sculpt the rim of a **locked** lake               | The brush cannot go below the level plus a small margin. The lake does not drain.               |

So a lake above sea level always has land between it and the ocean. It joins the ocean only if
its spill height comes down to sea level. Then it takes the ocean's level.

### Computing the spill height

For a generated lake, the spill height is the lowest ring height. After a sculpt, the rim may have
changed, so the editor finds it again with a **priority flood**:

1. Start from the lake's covered texels.
2. Always grow the lowest unvisited neighbour first, and keep track of the highest terrain
   height passed so far.
3. The first time the flood reaches ground lower than that height, the water would run out there.
   That highest point is the spill height.
4. The search runs only inside the lake's cell and its neighbours. If it reaches that edge first,
   the spill height is the lowest terrain height found on the edge.

The flood runs on the CPU at the water map's resolution, and only for lakes that the stroke
touched.

### Channels from the sea

A trench that joins the ocean and goes below sea level fills with sea water. A dry trench next to
the sea would look wrong.

After each sculpt stroke, the editor runs a flood fill:

1. Start from ocean texels (body 0, coverage > 0) at the edge of the edited area.
2. Spread to each neighbour texel where the terrain is below sea level.
3. Stop at the edited area plus the brush radius. The fill does not search the whole world.
4. Write coverage and body 0 into the water edit mask. The new water takes the ocean's level and
   type weights.

The trench fills a little more with each stroke, as the dig reaches farther inland. A trench that
does not touch the ocean stays dry.

**A canal to a lake.** If the channel reaches a lake, the lake's spill height drops to sea level.
The spill rule then drains the lake to sea level, and it joins the ocean as a lagoon.

**Undo.** A drain changes the level and the coverage. One undo step restores the terrain, the level
and the coverage together.

**Cost.** The spill check and the flood fill run on the CPU, and only after an edit. Both stay
inside a lake cell and its neighbours, so they stay small.

### Islands

Raised land inside water gets a full shoreline with no special work:

- **Foam, shallow colour and the wet band** come from `level − terrainHeight` in each pixel. They
  show as soon as the terrain updates.
- **Beach material** comes from the splat map. The worker builds it again after each sculpt. The
  beach rule uses height above water **and** slope, so steep sides get rock, not sand.
- **Scatter** regenerates with the same depth rules. Reeds, driftwood and seaweed follow.

### Climate

- **Coastal moisture.** Moisture increases near the ocean. The continent field gives this without
  a distance search: `coastalMoisture` is added at the coast and fades out `coastalMoistureReach`
  inland. It moves biomes only in a climate whose moisture axis has cuts.
- **Beaches.** A climate's `coast` lays sand over the biome layers, the way a layer covers those
  beneath it. The band is chosen by height above sea level: sand, then wet sand, then sea bed. It
  fades out on steep ground, so cliffs keep their rock, and it only appears where the continent
  field puts the ocean close, so low ground inland stays as it is. The biomes' scatter thins by the
  same amount, so trees do not grow on the sand. Wet sand and sea bed fall back to the sand when a
  climate has no splat channel spare for them.

## Rendering

### Frame order

```
scene pass (opaque)  ──▶ terrain, scatter, objects        ──▶ HDR colour + depth
        │
        ▼
refraction capture   ──▶ HDR colour + view depth          ──▶ refraction texture (rgba16f)
        │
        ▼
water pass           ──▶ per-chunk water patches          ──▶ HDR colour + depth (water writes depth)
        │                  reads: water map, refraction, sky cube, CSM, clouds
        │                ──▶ horizon ring (far shading only)
        │                ──▶ transparent meshes, BLEND materials (no depth write)
        ▼
atmosphere composite ──▶ sky, clouds, fog, god rays, rain over scene and water
        ▼
bloom + tonemap      ──▶ swapchain
```

Water writes depth. So the existing atmosphere composite puts fog over water at the correct
distance, and needs no change.

**The scene pass splits when water is in view.** The opaque groups draw, the pass ends, and
`RefractionCapture` copies the colour and the view depth, linearised from the depth buffer, into
one `rgba16float` texture. A second pass loads the colour and depth and draws the water, then the
transparent groups. BLEND materials write no depth, so water drawn after them would cover a
transparent mesh in front of it; drawing them after water, and after the capture, keeps them
tested against the water's depth and out of what the water refracts. Rain already draws with the
atmosphere, so it shows over water with no change. With no water in view, everything draws in the
one pass and nothing is copied.

### Mesh

No mesh is generated for a water body. The worker makes only data.

1. At startup, build one flat square grid for each LOD, for example 64², 32² and 16² quads. These
   buffers are shared by every chunk and never change.
2. For each visible chunk with `hasWater`, draw the grid at that chunk's LOD. The chunk binds its
   origin, its water map and its height texture, as it binds its splat map for terrain.
3. The vertex shader moves each vertex to `chunkOrigin + gridPosition`. It samples the water map
   for level, coverage and type weights. It sets the height to `level`, then adds the waves.
4. The fragment shader discards pixels where coverage is 0.
5. The depth test hides the water wherever the terrain is higher than the level. This makes the
   shoreline correct for each pixel. It is also why sculpting needs no change to the water data.

The cost is overdraw on chunks that are partly wet. The terrain in front of that water fails the
early depth test, so the rejected pixels are cheap.

**LOD seams.** Neighbouring chunks at different LODs have different edge spacing. Waves can open
small cracks between them. Use the terrain's skirt method (`MeshGenerator.ts`), or fade the wave
amplitude to zero at the edges of far chunks.

**Later.** If draw calls become a cost, put the chunk water maps in a texture array and draw every
wet chunk in one instanced call.

**Not chosen.** One grid centred on the camera, reading a "clipmap" texture that the CPU fills from
the chunk water maps. It gives one draw call and no seams, but it needs more new code. Per-chunk
draws reuse the chunk streaming and LOD that exist.

### Horizon

The world is flat, so open water should reach the horizon line. But the last terrain LOD ends at
2,800 m (`maxViewDst`), and the water patches end with it. The camera's far plane is 4,000 m.

The gap below the horizon covers an angle of about `eyeHeight / 2800`:

| Camera                        | Gap angle | On screen (about 0.06° per pixel) |
| ----------------------------- | --------- | --------------------------------- |
| Standing on a beach, 2 m      | 0.04°     | Less than 1 pixel                 |
| On a hill, 30 m               | 0.6°      | About 10 pixels                   |
| On a cliff or mountain, 150 m | 3°        | About 50 pixels                   |

A **horizon ring** closes the gap. It is one ring mesh, centred where chunk visibility was last
computed, from 2,800 m out to the horizon. Chunks stop on a ragged edge of whole squares, so the
ring discards any pixel whose chunk passes the terrain's own visibility test. The ring and the
chunk water then never overlap, and neither z-fights the other.

- **Shading.** The water shader with far features only: sky reflection, Fresnel, depth colour and
  the ripples as roughness. No waves, refraction or foam, because none of them show at that range.
- **Far map.** Two textures centred on the chunks' visibility centre hold, per texel, the raw
  continent value and the land's colour: 128² over 16 km, and 128² over 131 km for the rest of the
  way to the horizon. The continent value is smooth, so a bilinear sample of it gives a smooth
  coast. The CPU rebuilds a level a few rows per frame once the centre drifts an eighth of its span.
- **Land.** The ring draws the land past the chunks too, flat at sea level, as a matte surface in
  the far colour of the biomes there (`farColor` on each biome). Without it the sea would meet
  holes of bare sky below the horizon. Sea and land blend across the coast in one shading pass.
- **Fog.** The ring writes depth, so the atmosphere composite fogs it correctly.
- **The join.** The last chunks use the lowest LOD with no waves. The ring starts at sea level with
  the same flat shading, so the join does not show.
- **Past the far plane.** The gap after 4,000 m is about `eyeHeight / 4000`. That is under 1 pixel
  below about 70 m. For higher cameras, the ring's outer vertices use `w = 0`, so they project onto
  the horizon line. Those pixels would get the depth of the far plane, and the composite treats
  that depth as sky. So the ring clamps its depth just inside the far plane, and the composite
  fogs it as it does other far water.

### Surface

- **Waves.** The FFT ocean's displacement moves the grid in the vertex shader, sideways as well
  as up. Water types weight the **cascades**, not separate oceans, so the surface does not tear
  at a blend. The weather sets the sea. See [Wind](#wind).
- **Normals.** The FFT ocean's slopes, per pixel, with the gust field on the short cascades. See
  [Wind](#wind). No detail normal maps: they would tile.
- **Reflection.** Sample the prefiltered sky cube (`SkyCubeCapture`, `SkyIblPrefilter`). Rougher
  water samples a blurrier mip.
- **Sun glint.** A specular sun term, gated by CSM geometry shadows and cloud shadows. This follows
  the Foxfire rule: shadows act on the sun term only.
- **Fresnel.** Blends reflection and refraction by the view angle.
- **Depth colour.** Beer-Lambert absorption over the water depth, from the palette. Each chunk
  first writes its depth alone: the waves fold the surface over itself on screen, so the shading
  draws that follow test for equal depth and shade only the nearest layer, whatever order the
  triangles come in. The position is `@invariant` so all three draws agree on it, and chunks draw
  nearest first so a near crest hides the water behind it in the next chunk too. Then an absorb draw replaces the scene behind with the refracted
  scene times the transmittance and `1 − Fresnel`, per channel (see Refraction), and a light draw adds reflection and the light the water scatters back. The
  scatter is shaded as the diffuse lobe of a dielectric with F0 0.02, so sun, sky ambient and
  local lights all reach it.
- **Refraction.** The absorb draw replaces the scene behind with a sample of the refraction
  texture, times the transmittance and `1 − Fresnel`, blended by coverage. The view ray bends
  into the water (index 1.33) by the wave normal and is followed down the water depth, at most
  3 m; the sample moves by how far that lands on screen from where a flat surface would bend it,
  since the scene behind is already drawn where a flat surface puts it. Shallow water bends it
  less, so the offset fades out at the shore. A sample whose view depth is in front of the water
  is not under it, and the pixel keeps its own.
- **Foam.** Shore foam where the depth is small. Crest foam where waves are steep. See
  [Foam](#foam).

### Wind

`SkyRenderer` gives `windDirection` (a normalized XZ vector) and `windiness` (0 to 1). The base
wind speed is `windiness × 10` m/s, with gusts on top. Foliage already reads the same wind.

- **FFT ocean.** `OceanFFT` runs a Tessendorf ocean (adapted from Tidewater, MIT) in one compute
  pass a frame: four cascades of 256² texels over tiles of 733, 157, 33.3 and 7.1 m. Their ratios
  are not whole numbers, so the tiles never repeat in step. Each cascade holds the wavenumbers from
  6 cycles over its own tile to 6 over the next (`cascadeBand`), so every wave lives in exactly
  one. A row and a column inverse transform give per cascade a displacement texture (Dx, Dy, Dz,
  foam) and a slope texture (dDy/dx, dDy/dz, dDx/dx, dDz/dz), 2D arrays with compute-built mips.
- **Spectrum.** JONSWAP with directional spreading (`OceanSpectrum`), for two sea states: a local
  **wind sea** over a 200 km fetch, spread around the wind, and a **swell** from a fixed bearing
  over 1200 km, narrow and always there, about 0.7 m high: a slow heave under the wind sea. The spectrum sets the random phases once per wavenumber
  from a seed; changing the wind only rebuilds the amplitudes, so the surface never jumps.
- **Wind.** The weather's `windiness` maps to a wind speed from 0.5 m/s to 22 m/s, climbing as
  `windiness^1.5` (`oceanWindSpeed`): a sea about 0.2 m high in a calm, 2.5 m at 0.5 and 5.9 m at
  1. The ocean follows the weather's wind lagged by 6 s, so a sea builds and
  calms, and it rebuilds the spectrum when the lagged wind has moved by 0.05 m/s or 0.5°. A
  stronger wind raises a longer, higher sea. The clock runs up to 60% faster in full wind, so a
  storm's chop looks agitated; it only accumulates, so a change of rate never jumps.
- **Choppiness.** The horizontal displacement is 1.9 × its linear value: crests sharpen and
  bunch, troughs broaden.
- **Speed.** A wave's speed comes from its length, as in deep water, `c = √(g·λ / 2π)`. Every
  angular frequency is snapped to whole cycles over a 1024 s loop, and the clock wraps there.
- **Water types.** A palette type takes every cascade up to 8 × its `waveScale` long, fading out
  by 16 ×, scaled by its `waveResponse` (`cascadeWeight`). The ocean (100 m) takes all four; a
  lake (10 m) takes only the 33.3 m and 7.1 m cascades, so it stays small in any wind.
- **Variation.** Two independent fields of value noise scale the waves so no two stretches of
  water look alike: a swell field (760 m and 280 m cells, 0.35 to 1.35) and a chop field (430 m
  and 150 m cells, 0.08 to 1.45). Each cascade blends the two by its length, from the longest to
  the shortest, so one stretch is rolling swell, the next busy chop, and where the chop field
  bottoms out a glassy slick. The noise drifts downwind at 2.5 m/s at full wind, so rough patches
  cross the water. Its lattice repeats every 256 cells, so the drift wraps.
- **Grid and distance.** Water grids are 2 m a quad within the first LOD distance, then 4, 8,
  16 and 32 m. A vertex samples each cascade's displacement at the mip whose texels match the
  grid, 0.7 levels coarser, so no wave shorter than the grid can hold moves it. The spacing comes
  from the vertex's **distance** from where chunk LODs were last chosen, not from its chunk's grid:
  the coarsest grid the LOD system can put there, ramped in 60 m before each LOD distance. Two
  chunks meeting at a vertex measure the same distance and sample the same mip, so the seam does
  not crack. Waves die down over the last 1.5 m of depth.
- **Precision.** Positions are measured from an origin near the camera, snapped to 1024 m. The CPU
  gives each cascade where that origin falls in its tile, in double precision, so the shader adds
  only small numbers.
- **Normals.** The pixel shader samples each cascade's slopes at the pixel's rest position (where
  its water came from), with gradients from the pixel's footprint: anisotropic, trilinear. The
  normal divides the height slopes by the surface's stretch. The slope a mip averages away is
  estimated from a wind sea's mean square slope (Cox and Munk, `0.003 + 0.00512 × U`) times the
  share of the spectrum finer than the pixel, and added to α², so the highlight widens instead of
  sparkling.
- **Quality.** The `water` quality aspect (`WaterQuality.ts`) biases the slope mip, from −0.5 on
  ultra to 1 on low. The displacement and the foam are the same on every tier.
- **Gusts.** The foliage gust field (`gustField` in `scatter-wind.wgsl`, read with the same wind
  vector) scales the shortest cascade, and half of the next, from 0.5 in a lull to 1.8 in a gust,
  fully from a wind strength of 0.5. This makes "cat's paws": dark patches of ripples that run
  downwind across the water, and one gust crosses the water and then the forest.

### Waves at the shore

The shader has the depth and the terrain height texture. These give the main shore effects:

- **Shoaling.** Waves get shorter and steeper in shallow water, then flatten at the waterline.
  Scale the cascade amplitudes by depth, longest first.
- **Shore waves.** A separate layer whose crests run parallel to the coast and travel inward:
  phase `k·d − ω·t` over a smoothed distance to shore `d`, built per chunk with the water map.
  It fades in over a depth band and steepens as the water shallows, while the open-water chop
  fades out, so every bay and island gets waves that arrive parallel to its beach.
- **Foam lines.** Bands of foam driven by `depth − time` roll toward the shore and fade out.
- **Swash.** Near the shore, the level rises and falls a little over time. The water runs up the
  beach and back, and the wet band grows and shrinks with it.

Breaking waves that curl over are out of scope. A heightfield cannot overhang.

### Foam

At `windiness = 1` the base wind is 10 m/s (Beaufort 5), and gusts reach gale strength. The trees
already look like a strong wind at that value. The water must match them, so high wind needs a lot
of foam. Tune this mapping together with the foliage:

| `windiness` | Wind              | Water                                                   |
| ----------- | ----------------- | ------------------------------------------------------- |
| 0           | Calm              | Mirror surface, no foam                                 |
| 0.3         | 3 m/s             | Small ripples, no foam                                  |
| 0.5         | 5 m/s             | Small waves, a few whitecaps                            |
| 0.8         | 8 m/s             | Moderate waves, many whitecaps                          |
| 1.0         | 10 m/s and gusts  | Rough sea, whitecaps everywhere, long foam trails    |

The foam uses no saved state:

- **Texture.** `nature/water/sea-foam.webp` (`WaterTextures`), white foam against transparent. The
  shader reads its brightness × alpha as a density and shows foam where the density passes
  `1 − coverage`, so more coverage grows the patches out from the densest clumps. Its opacity runs
  from 0.35 on the thinnest foam to 1 on the densest, so bubbles and thin spots show the water
  through. It tiles twice,
  8 m and 12.8 m turned 37°, to hide the repeat, and drifts downwind at 1.5 m/s at full wind; the
  CPU accumulates the drift and wraps it at 8192 m, which every tiling divides.
- **Whitecaps.** Foam where the surface compresses: the ocean's Jacobian, from the choppy
  displacement's derivatives. Each cascade's texel makes foam where it falls below 0.89, adds it
  at 3.5 a second and lets it decay at 0.95 a second, in a buffer kept from frame to frame. The
  vertex stage sums it over the cascades (0.35, 0.45, 0.5 and 0.25 of each); the pixel adds fresh
  foam where its own slopes squeeze the surface below 0.43 now.
- **Persistence.** The foam buffer lives at the water's rest positions, so the foam rides the
  surface it formed on and is left behind as the crest moves on, thinning into lace as its
  coverage decays. Far out the texture averages to grey, so from 0.15 m to 1.2 m of water per
  pixel the plain coverage takes over.
- **Per type.** The palette's foam amount scales it all, so a lake stays much calmer than the ocean
  in the same wind.
- **Shading.** All foam is scaled by an overall opacity of 0.9. It is a rough (0.6), bright
  (albedo 0.65) diffuse layer: the light draw blends
  the water's diffuse and roughness toward it, and the absorb draw hides the water beneath it.

Stretch goals: a foam texture that follows the camera and updates each frame in a compute pass,
for real persistence. Spray blown off the crests at high wind, starting from the rain particle
pass.

### Terrain changes

The terrain shader reads the chunk's water map as well:

- A darker, glossier **wet band** just above the water level.
- **Under-water tint** on the bed, so the bed looks correct through the surface.
- **Caustics** on the bed, projected from the sun (Phase 5).

## Scatter

New conditions for a scatter layer, AND'ed with slope, height and noise:

- `waterDepth`: a range. Negative values are height above the water. The layer grows only where
  water reaches, fading with its coverage.
- `waterType`: only grow where a given palette type has weight, for example "lake" for reeds.
- By default, a layer does not grow where `waterDepth > 0`. A layer sets `underwater: true` to
  grow there, for example seaweed or lilies.
- A layer with none of these conditions is thinned by the beach.

Example additions: reeds at lake edges, driftwood on beaches, lilies on still lakes, seaweed on the
shelf.

## Editor

- **Water brush** in the editor ribbon, next to sculpt, biome paint and scatter.
  - **Level**: click to sample a level, then drag to set it. This works like the flatten brush.
    The level cannot go above the spill height.
  - **Paint type**: paint water palette weights.
  - **Add / remove water**: paint coverage. Adding water on dry land makes a new body record.
  - **Lock**: lock or unlock a lake's level. See [Edit rules](#edit-rules).
- The sculpt brush applies the edit rules after each stroke. A lake that drains shows its new
  shore at once.
- Water edits save with the other terrain edits, local first and then to the cloud.
- **Debug views** as console commands: level, coverage, type weights, depth and flow.

## Gameplay

- A **water query**: `sample(x, z)` gives level, depth, coverage, type weights, body ID and
  flow from the same data as the shader, and the wave height from a GPU readback.
- The readback samples the FFT displacement for a few points a frame and arrives a frame or three
  late. The displacement is sideways as well as up, so a point's height is found by solving for
  the rest position that lands on it, a few fixed-point steps.
- The player does not walk on water. Shallow water slows the player. Deep water makes the player
  swim at the surface.
- The camera knows when it is under water. Phase 5 uses this for the under-water effect.

## Phases

1. **Water map and ocean.** Continent field, sea level, water map and height texture in the worker,
   `hasWater`, the shared grid mesh, the horizon ring, sky reflection, depth colour, beach band,
   scatter kept out of water.
2. **Lakes.** Lake cells, carving, lagoons, water body records and palette blending.
3. **Surface detail.** The FFT ocean from the wind, gusts, whitecaps, refraction,
   sun glint, the wet band and waves at the shore.
4. **Editor and gameplay.** Water brush, edit rules and spill height, sea channels, locked lakes,
   saved edits, water query with CPU waves, wading and swimming.
5. **Stretch.** Under-water post-process, caustics, rain ripples on water, a persistent foam
   texture, spray, noise-channel rivers.

## Performance notes (web budget)

- **One extra full-screen copy** per frame for the refraction texture (HDR colour).
- Water patches draw only for chunks with coverage. Dry chunks cost nothing.
- Patches reuse terrain LOD. Far water uses fewer vertices and fewer waves.
- One compute pass a frame for the ocean: two transforms and the mip chains over four 256²
  cascades. The vertex shader takes a displacement sample per cascade; the fragment shader a slope
  sample per cascade, one sky cube sample and two refraction samples.
- The horizon ring is one draw call. Its vertices take no waves, and its pixels skip refraction.
- `QualitySettings` controls the ocean's slope mip bias.

## Open questions

- **Generated ground below sea level, inland.** Edited trenches fill only if they connect to the
  ocean. Generated terrain has no such check, because a connection is not a local question. The
  draft keeps it dry by using the continent field for coverage. Is that enough, or must generation
  prevent inland ground below sea level?
- **Wind mapping.** Is the foam table right for how windy the trees look? Tune the two together.
- **MSAA.** The scene depth texture is multisampled when `sampleCount > 1`. The water pass must
  resolve it or read one sample.
- **Palette size.** Ocean and lake only, or swamp as well in Phase 2?
