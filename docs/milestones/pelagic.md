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
- **Foam that matches the wind**, from a calm mirror to whitecaps and streaks at full wind.
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
- **FFT ocean simulation.** A sum of Gerstner waves is cheaper and easier to control on the web.
- **Buoyancy, boats and floating objects.** These belong to the objects milestone.
- **Tides.** Sea level stays fixed for a world.

## Key technical decisions

| Decision              | Choice                                              | Why                                                                                                                  |
| --------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Water model           | **One per-chunk water map** for every water body    | Oceans and lakes use the same data and shader. They blend where they meet. No special case at the join.              |
| Water types           | **Weights over a water palette**                    | This mirrors the splat and material palette. "60% ocean, 40% lake" is a plain weight blend.                          |
| Surface height        | **Stored in the water map** with a coverage value   | Type weights say what the water looks like. Level says where it is. A blend needs both.                               |
| Level rule            | **Continuous wherever water shows**                 | Two bodies can touch only at the same level. A level can change only where land separates them.                     |
| Wave strength         | **Palette response × smoothed weather wind**        | A storm acts on every water body at once. Nothing extra is saved per texel.                                          |
| Water mesh            | **One shared flat grid per LOD**, drawn per wet chunk | No mesh is generated for a water body. The vertex shader places the grid and reads the chunk's water map.          |
| Shoreline             | **Depth test against the terrain**                  | The water plane covers the whole chunk. Terrain above the level hides it, so the shore is correct for each pixel.    |
| Shore effects         | **Depth from the map**: `level − terrainHeight`     | Foam, shallow colour and wet sand stay stable at low view angles. They do not depend on screen depth.                |
| Terrain height on GPU | **New per-chunk `R16F` height texture**, relative to the chunk's base level | The terrain mesh is built on the CPU, and the GPU has no heights today. Shore effects need them. Relative values keep `f16` precise near the waterline. |
| Lakes                 | **Sparse seeded cells**, one possible lake per cell | Any chunk can compute a lake's shape and level from the seed. It needs no data from other chunks.                     |
| Water bodies          | **Records with an ID**, plus a body ID channel      | Edit rules must know which lake a texel belongs to. The ocean is body 0.                                             |
| Edit rule             | **A lake's level is at most its spill height**      | The editor keeps levels valid with no water simulation. A high lake cannot join the ocean by accident.               |
| Edits                 | **Extend `PaintMask`** plus a float level grid      | One format, one sampler and one brush. It reuses the existing seam fix at chunk edges.                                |
| Wave queries          | **Same Gerstner sum on the CPU and the GPU**        | Gameplay needs a few heights per frame. A GPU readback arrives frames late, so the CPU computes them.                |
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
| `spillHeight`  | The lowest point of the rim. Calculated, not authored. See [Computing the spill height](#computing-the-spill-height). |
| `locked`       | If true, the sculpt brush cannot lower the rim below the level.              |
| `typeWeights`  | The default palette weights for new water in this body.                      |

A generated lake that nobody edits costs nothing to save. The seed builds its record again.

**Coverage and the terrain.** Water shows where coverage > 0 **and** `terrainHeight < level`. So
sculpting changes the shore with no change to the water data. Dig a hole in the lake bed and it
fills. Raise an island and the water moves away from it.

**The water palette.** It lives in `ClimateConfig` beside the biomes. Each entry defines:

- Scattering colour and absorption (for Beer-Lambert depth colour).
- Turbidity: how quickly the bed disappears with depth.
- Wave response: how strongly the wind moves this water.
- Wave scale: long ocean swells, or short lake ripples.
- Wind lag: how many seconds the waves take to follow a change in wind.
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

The world is split into a coarse grid of **lake cells**, for example 4 × 4 chunks each. The seed
decides if a cell holds a lake, and where its centre is. Any chunk can compute every lake that
touches it:

1. Take the lake centre and a noise-distorted radius from the cell's seed.
2. Sample the pre-lake terrain at a fixed ring of points around the lake. Terrain is procedural,
   so any point can be sampled.
3. Set the lake level to the lowest ring height minus a margin. This makes sure that land
   surrounds the water on all sides.
4. Carve the lake bed below that level with a smooth depth profile.
5. Write coverage, level and the "lake" type weight into the water map.

Reject a cell's lake if the ground is too steep or the ring heights differ too much.

**Cells around the chunk.** A lake can reach past its own cell. A chunk checks its own lake cell
and the 8 cells around it. The maximum lake radius, including the ring, is less than one cell, so
the 3 × 3 check always finds every lake that touches the chunk.

**Spacing.** Two lakes at different levels must not overlap, or the level would jump. Each lake
keeps a minimum distance from the lakes in the neighbouring cells: the two radii plus a shore
margin. When two lakes are too close, the lake with the lower cell hash is removed. Every chunk
makes the same choice, because it uses only the seed.

### Where a lake meets the ocean

If a lake's lowest ring point is at or near sea level, the lake becomes a **lagoon**:

- Its level becomes sea level. So the level stays continuous.
- Its type weights blend from "lake" at the centre to "ocean" at the coast.

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
  a distance search.
- **Beaches.** A new terrain material band, chosen by height above the water level. Sand, then wet
  sand, then sea bed.

## Rendering

### Frame order

```
scene pass (opaque)  ──▶ terrain, scatter, objects        ──▶ HDR colour + depth
        │
        ▼
copy HDR colour      ──▶ refraction texture
        │
        ▼
water pass           ──▶ per-chunk water patches          ──▶ HDR colour + depth (water writes depth)
        │                  reads: water map, heights, refraction, depth, sky cube, CSM, clouds
        │                ──▶ horizon ring (far shading only)
        ▼
transparent meshes   ──▶ BLEND materials, far to near     ──▶ HDR colour (no depth write)
        ▼
atmosphere composite ──▶ sky, clouds, fog, god rays, rain over scene and water
        ▼
bloom + tonemap      ──▶ swapchain
```

Water writes depth. So the existing atmosphere composite puts fog over water at the correct
distance, and needs no change.

**Transparent meshes draw after water.** BLEND materials write no depth, so water drawn after them
would cover a transparent mesh in front of it. The renderer orders draw groups opaque, then water,
then transparent, so they test against the depth water wrote. When refraction adds the colour
copy, they move to their own pass after water, or the copy would take them in as if they were
under the water. Rain already draws with the atmosphere, so it shows over water with no change.

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

A **horizon ring** closes the gap. It is one ring mesh, centred on the camera, from 2,800 m out to
just inside the far plane.

- **Shading.** The water shader with far features only: sky reflection, Fresnel, depth colour and
  the ripples as roughness. No waves, refraction or foam, because none of them show at that range.
- **Coverage.** The ring draws only where the continent field says "ocean". A small texture
  centred on the camera holds the field, for example 64² texels over 16 km. The CPU updates it when
  the player moves far enough.
- **Land.** The ring does not cover land past the chunks. Land already stops at 2,800 m, and fog
  hides it.
- **Fog.** The ring writes depth, so the atmosphere composite fogs it correctly.
- **The join.** The last chunks use the lowest LOD with no waves. The ring starts at sea level with
  the same flat shading, so the join does not show.
- **Past the far plane.** The gap after 4,000 m is about `eyeHeight / 4000`. That is under 1 pixel
  below about 70 m. For higher cameras, the ring's outer vertices use `w = 0`, so they project onto
  the horizon line. Those pixels would get the depth of the far plane, and the composite treats
  that depth as sky. So the ring clamps its depth just inside the far plane, and the composite
  fogs it as it does other far water.

### Surface

- **Waves.** A small sum of Gerstner waves in the vertex shader, as a function of world position.
  Blend the wave **amplitudes** between water types, not two separate wave shapes. So the surface
  does not tear at a blend. The weather sets the wave direction and strength.
- **Normals.** Two scrolling detail normal maps. Where flow is set, scroll them along the flow.
- **Reflection.** Sample the prefiltered sky cube (`SkyCubeCapture`, `SkyIblPrefilter`). Rougher
  water samples a blurrier mip.
- **Sun glint.** A specular sun term, gated by CSM geometry shadows and cloud shadows. This follows
  the Foxfire rule: shadows act on the sun term only.
- **Fresnel.** Blends reflection and refraction by the view angle.
- **Depth colour.** Beer-Lambert absorption over the water depth, from the palette. Each chunk
  draws twice: an absorb draw multiplies the scene behind by the transmittance and `1 − Fresnel`,
  per channel, and a light draw adds reflection and the light the water scatters back. The
  scatter is shaded as the diffuse lobe of a dielectric with F0 0.02, so sun, sky ambient and
  local lights all reach it. Refraction replaces the absorb draw with an offset sample of the
  scene copy.
- **Refraction.** Offset the refraction texture sample by the surface normal. Reject samples that
  land in front of the water, from the scene depth.
- **Foam.** Shore foam where the depth is small. Crest foam where waves are steep. See
  [Foam](#foam).

### Wind

`SkyRenderer` gives `windDirection` (a normalized XZ vector) and `windiness` (0 to 1). The base
wind speed is `windiness × 10` m/s, with gusts on top. Foliage already reads the same wind.

- **Direction.** Spread the Gerstner wave directions around `windDirection`, for example ±30°. The
  waves then travel with the wind.
- **Speed.** A wave's speed comes from its length, not from the wind. In deep water,
  `c = √(g·λ / 2π)`. The wind sets the wave **height** and **direction** only. So long swells stay
  slow and heavy, and short chop stays fast.
- **Lag.** Waves take time to grow and to calm. Drive the amplitude from a smoothed wind. Use a
  time constant of tens of seconds for the ocean, and a shorter one for lakes. When the direction
  changes, fade the old wave set into the new one.
- **Gusts.** Gusts act on the detail normal maps only. They make "cat's paws": dark patches of
  ripples that run across the water. The same gust field moves the trees, so one gust crosses the
  water and then the forest.

### Waves at the shore

The shader has the depth and the terrain height texture. These give the main shore effects:

- **Shoaling.** Waves get shorter and steeper in shallow water, then flatten at the waterline.
  Scale the Gerstner amplitude and length by depth.
- **Turning toward the beach.** The terrain height gradient points toward the shore. In shallow
  water, bend the wave direction toward it. Waves then arrive parallel to the beach.
- **Foam lines.** Bands of foam driven by `depth − time` roll toward the shore and fade out.
- **Swash.** Near the shore, the level rises and falls a little over time. The water runs up the
  beach and back, and the wet band grows and shrinks with it.

Breaking waves that curl over are out of scope. A Gerstner heightfield cannot overhang.

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
| 1.0         | 10 m/s and gusts  | Rough sea, whitecaps everywhere, foam streaks with wind |

The foam uses no saved state:

- **Whitecaps.** Foam where the Gerstner surface is steep. The shader gets the steepness from the
  wave derivatives. `windiness` raises the amount.
- **Persistence.** Real foam stays after the crest passes. Gerstner waves have no history, so a
  noise texture leaves patches behind the crests.
- **Streaks.** Above about 0.8, add foam texture stretched along `windDirection`.
- **Per type.** The palette's foam amount keeps a lake much calmer than the ocean in the same wind.

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

- `waterDepth`: a range. Negative values are height above the water.
- `waterType`: only grow where a given palette type has weight, for example "lake" for reeds.
- By default, a layer does not grow where `waterDepth > 0`. A layer sets `underwater: true` to
  grow there, for example seaweed or lilies.

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

- A CPU **water query**: `sample(x, z)` gives level, depth, coverage, type weights, body ID and
  flow. It reads the same data as the shader.
- The query adds the **same Gerstner sum** as the vertex shader, so the player sits on the waves
  that you see. Gameplay needs only a few points per frame, which costs microseconds on the CPU. A
  GPU compute readback arrives frames late, so the player would bob out of time with the surface.
- Gerstner waves move points sideways as well as up. The sum gives where a rest point `p` goes,
  not the height at a fixed `(x, z)`. The query finds the rest point whose displaced position lands
  on `(x, z)`: start at `p = (x, z)`, then set `p = (x, z) − horizontalOffset(p)` 3 or 4 times.
  Then it takes the height at `p`.
- To keep the two sums the same:
  - One source of wave parameters. The CPU reads it and uploads it to the GPU.
  - The same time value each frame, wrapped to a loop length so `f32` keeps its precision.
  - A unit test that compares the TypeScript and WGSL results at fixed points, including the
    sideways offset.
- Normal maps never change the height, so the CPU ignores them.
- The player does not walk on water. Shallow water slows the player. Deep water makes the player
  swim at the surface.
- The camera knows when it is under water. Phase 5 uses this for the under-water effect.

## Phases

1. **Water map and ocean.** Continent field, sea level, water map and height texture in the worker,
   `hasWater`, the shared grid mesh, the horizon ring, sky reflection, depth colour, beach band,
   scatter kept out of water.
2. **Lakes.** Lake cells, carving, lagoons, water body records and palette blending.
3. **Surface detail.** Gerstner waves from the smoothed wind, normal maps with gusts, whitecaps and
   streaks, refraction, sun glint, the wet band and waves at the shore.
4. **Editor and gameplay.** Water brush, edit rules and spill height, sea channels, locked lakes,
   saved edits, water query with CPU waves, wading and swimming.
5. **Stretch.** Under-water post-process, caustics, rain ripples on water, a persistent foam
   texture, spray, noise-channel rivers.

## Performance notes (web budget)

- **One extra full-screen copy** per frame for the refraction texture (HDR colour).
- Water patches draw only for chunks with coverage. Dry chunks cost nothing.
- Patches reuse terrain LOD. Far water uses fewer vertices and fewer waves.
- The vertex shader sums 4 to 8 waves. The fragment shader takes two normal samples, one sky cube
  sample, one depth sample and one refraction sample.
- The horizon ring is one draw call. Its vertices take no waves, and its pixels skip refraction.
- `QualitySettings` controls the wave count, refraction and crest foam.

## Open questions

- **Generated ground below sea level, inland.** Edited trenches fill only if they connect to the
  ocean. Generated terrain has no such check, because a connection is not a local question. The
  draft keeps it dry by using the continent field for coverage. Is that enough, or must generation
  prevent inland ground below sea level?
- **Wind mapping.** Is the foam table right for how windy the trees look? Tune the two together.
- **MSAA.** The scene depth texture is multisampled when `sampleCount > 1`. The water pass must
  resolve it or read one sample.
- **Palette size.** Ocean and lake only, or swamp as well in Phase 2?
