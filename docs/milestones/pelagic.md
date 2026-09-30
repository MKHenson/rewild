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
chunk. The base level is the lowest water level in the chunk. Water **shows** where the ground
dips below a covered level, or below it plus the swash's 1.5 m reach. A chunk where none shows
draws no water (`shows` is false). It keeps its water map only while its ground comes within 2 m
of a covered level, for the terrain's wet band. Otherwise it gets none. Most inland chunks are in
this group.

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
| `locked`       | If true, the sculpt brush cannot lower the rim below the level plus a margin. |
| `typeWeights`  | The default palette weights for new water in this body.                      |

A generated lake that nobody edits costs nothing to save. The seed builds its record again. Each
chunk's water map carries the records of the bodies that cover it (`WaterMap.bodies`), as the
seed and the edit build them.

**Saved records.** A body the editor has changed has a saved record: one whose rim a sculpt
stroke touched (its spill height found again, and its level if it drained), a locked one, and one
made with **Add water**. They live in one blob per level, `water-bodies.json`, in the chunk
folder beside the water edits, so clearing a level's chunks clears them too. A saved record
wins over the one the seed or the edit builds. `WaterBodyRules` (`TerrainRenderer.waterRules`)
reads them once through `waterBodyProvider` and holds them for the edit rules.

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

**After a stroke.** When a sculpt stroke ends, the editor saves the heights and then runs the
rules over the box the stroke covered, plus two texels. Every body other than the ocean that owns
a texel there is touched. Each has its spill height found again, and one whose level stands more
than 5 cm above it **drains**:

- Its level drops to the spill height, in every texel it owns.
- It keeps its water over the **basin**: its texels below the spill height that drain through the
  outlet, and one texel around them for the shoreline. Its other texels go dry. A hollow inside
  the old shore that is cut off from the basin at the new level goes dry too; **Add water** puts
  a pond back.
- The result is written into the water edits of every chunk the body covers, loaded or not, with
  full authority, so it overrides the generated lake. The edits and the record are saved.

**Joining the ocean.** When the outlet is the sea and the rim was cut to sea level or below,
the lake drains to sea level and becomes a lagoon. It keeps its body ID. Its type weights blend
from its own water, out to 80% of the way from its deepest point to its shore, to "ocean" at the
shore. The cut between it and the sea is filled by the sea channel flood fill (see
[Channels from the sea](#channels-from-the-sea)), not by the drain. A cut that stops above sea
level drains the lake to the cut, and it stays a lake.

**Locked lakes.** A locked body never drains. While a stroke runs, each chunk gets the locked
level over every texel a locked body owns and the texels next to it (`lockedLevels`). A sample
there that stands above that level cannot be lowered below the level plus the lakes' `margin`
(1 m in the default climate, the lip's height), or below where it stands if that is lower.
Ground below the level, such as the lake bed, can be dug freely. Raising is never held back. The
brush skips a chunk until the records and its water edit are read, as it does until its heights
are.

### Computing the spill height

For a generated lake, the spill height is the lowest ring height. After a sculpt, the rim may have
changed, so the editor finds it again with a **priority flood** (`findSpillHeight`):

1. The body is every texel it owns connected to the texels the stroke touched. The flood starts
   from those that are covered and below its level.
2. Always grow the lowest unvisited neighbour first, and keep track of the highest terrain
   height passed so far.
3. The first time the flood reaches ground lower than that height, the water would run out there.
   That highest point is the spill height.
4. If the flood reaches the sea (covered ocean texels over ground below sea level), the spill
   height is that highest point or sea level, whichever is higher.
5. The search runs only inside the lake cell that holds the centre of the flood's starting
   texels, and that cell's neighbours. If it reaches that edge first, the spill height is the
   highest ground it crossed to get there.

Another lake's covered water counts as ground at its surface. The basin a drain keeps comes from
the flood as well. It grows from the path to the outlet through the texels the flood took, at or
below the spill height. For a lake joining the sea, it grows through the lake's own texels too.

The flood runs on the CPU at the water map's resolution, and only for lakes that the stroke
touched. Its heights are the samples on the texels, so it may not see a cut narrower than a
texel (8 m).

**Chunks that are not loaded.** The flood and the drain reach past what is loaded. A chunk they
need takes its in-memory heights, else its saved snapshot, else its generated heights, built on a
worker (`TerrainRenderer.generateChunkHeights`). Its water edit comes from the chunk, or from the
store if the chunk is not loaded. When the search needs a chunk it does not have, it reads the
chunk and its eight neighbours together, and runs again. A drained chunk that is not loaded has
its edit saved, and reads it when it loads.

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
The spill rule then drains the lake to sea level, and it joins the ocean as a lagoon. The spill
flood finds the sea through the terrain on its own, so a rim cut down to sea level beside the
ocean joins it without the channel. The channel fills the cut with sea water.

**Undo.** A drain changes the level and the coverage. One undo step restores the terrain, the level
and the coverage together: a chunk's heights and its water edit (see
[Water edits](#water-edits)) are captured and restored as one unit (`cloneWaterEdit`,
`TerrainChunk.setWaterEdit`). The editor's undo stack is its own work, shared by every terrain
brush.

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
2. For each visible chunk where water `shows`, draw the grid at that chunk's LOD. The chunk binds its
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
- **Normals.** The FFT ocean's slopes, per pixel. See [Wind](#wind). No detail normal maps: they
  would tile.
- **Reflection.** Sample the prefiltered sky cube (`SkyCubeCapture`, `SkyIblPrefilter`). Rougher
  water samples a blurrier mip.
- **Sun glint.** A specular sun term, gated by CSM geometry shadows and cloud shadows. This follows
  the Foxfire rule: shadows act on the sun term only.
- **Fresnel.** Blends reflection and refraction by the view angle.
- **Crest glow.** Sunlight through the thin top of a wave, after the height term of the Atlas
  water talk. It fades in with the wave's height from 0.5 m to 3 m above rest. It needs the
  viewer to face the sun across the water, compared flat so a high sun still counts
  (`facing³`), and a face turned away from the sun (`(1 − N·L)⁴`). Its colour is the palette's
  scatter shifted toward green. It is gated by the sun's shadows, and fades where the bed shows
  or foam covers the water. `setWaterCrestGlow(strength)` scales it in the console, 1 the default.
- **Trough darkening.** Troughs are darker than crests. A trough sees less sky, since much of
  what it reflects is the next wave, so the sky reflection and ambient fall to 84%. Less light
  reaches the water under it than under a thin crest, so its scatter falls to 84%. Both reach
  their floor at 3.5 m below rest. Water at rest or above is unchanged, so a calm sea is too.
  `setWaterTroughDarkening(strength)` scales it in the console, 1 the default.
- **Scatter lighting.** The light the water scatters back comes from under the surface, so its
  diffuse lobe is lit along the vertical, not by each ripple's tilt. Shading it by the wave normal
  reads as painted plastic. The waves show through the reflection and the Fresnel instead. Foam is
  a surface layer, so its diffuse takes the wave normal. The scatter colours are dark (ocean
  `[0.003, 0.018, 0.04]`, tropical `[0.004, 0.03, 0.06]`) so the sky's reflection stands out.
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
wind speed is `windiness × 10` m/s, with gusts on top. Foliage reads the gusts. The ocean reads
the direction and the windiness.

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
  stronger wind raises a longer, higher sea.
- **Rough sea.** A measured spectrum reads as a gentle heave at game scale, so the windiness also
  roughens the wind sea past it (`seaState`), climbing as `windiness^1.5`. At full wind the wave
  heights are 2.5 ×, 20% of the energy spreads over all directions so waves cross into pointed
  peaks, and the peak wavelength is held to 90 m so the energy is in the waves the viewer sees.
  `setOceanSeaState({ ... })` overrides it in the console.
- **Choppiness.** The horizontal displacement is 0.8 × its linear value in a calm, rising to 1.1
  in full wind: crests sharpen and bunch, troughs broaden.
- **Speed.** A wave's speed comes from its length, as in deep water, `c = √(g·λ / 2π)`. Every
  angular frequency is snapped to whole cycles over a 1024 s loop, and the clock wraps there.
- **Water types.** A palette type takes every cascade up to 8 × its `waveScale` long, fading out
  by 16 ×, scaled by its `waveResponse` (`cascadeWeight`). The ocean (100 m) takes all four; a
  lake (25 m, 0.6) takes all but the 733 m cascade: about 0.13 m in a calm and 1.3 m in a gale,
  a short choppy sea under the same shoaling as the ocean, with no shore waves.
- **Grid and distance.** Water grids are 2 m a quad within the first LOD distance, then 4, 8,
  16 and 32 m. A vertex samples each cascade's displacement at the mip whose texels match the
  grid, 0.7 levels coarser, so no wave shorter than the grid can hold moves it. The spacing comes
  from the vertex's **distance** from where chunk LODs were last chosen, not from its chunk's grid:
  the coarsest grid the LOD system can put there, ramped in 60 m before each LOD distance. Two
  chunks meeting at a vertex measure the same distance and sample the same mip, so the seam does
  not crack.
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

### Waves at the shore

The shader has the depth and the terrain height texture. These give the main shore effects:

- **Shoaling.** Water holds a sea whose significant height is at most 0.6 of its depth; taller
  waves break. The CPU integrates the spectrum over each cascade's band for its RMS height
  (`cascadeVariance`), and the shader shares the depth's budget out from the shortest cascade to
  the longest, so shallow water loses its long heave first and keeps its chop. Sideways movement
  and slopes scale with the height. Troughs ease toward a floor at 0.8 of the depth, so a rare
  deep one never reaches the bed. Lakes are held the same way. Crest foam is not held: a
  depth-limited sea is breaking, so its foam stays until the last 1.5 m.
- **Shore waves.** Two trains of Gerstner waves roll in from deep water, with periods of 8 s and
  9.7 s that beat into sets. Their phase is `ω × (time − T)`, where `T` is the seconds a wave
  takes to get to a point from water 24 m deep, moving at the shallow-water speed `√(g·h)` and
  blocked by land (`ShoreField`). `T` comes from an eikonal solve by fast sweeping over a
  256² grid of 8 m texels around the camera, from the terrain heights and the chunks' ocean
  coverage. A shelf can keep water 24 m deep outside the grid. A grid without it starts the
  waves from water within 2 m of its deepest, which lies out to sea. Water that joins the open sea
  only outside the grid, such as a bay behind a headland past its edge, starts them where it meets
  the grid's edge. The wavefronts are the crests, so they turn toward the shallows, wrap around
  headlands and islands, fill bays, and slow and bunch up as the bed rises. Water deep water
  cannot reach, such as a lagoon behind a bar, gets none, and so do lakes. Past the water the
  waves reach, the times carry on at a metre-deep wave's speed with no strength, so the phase has
  no step where a lagoon or lake meets the sea. The grid is aligned
  to the world. It follows the camera 128 m at a time and is rebuilt a second after ground loads
  or changes: sampled over a few frames, then solved, extended, and packed and uploaded, a frame
  each. The waves fade
  toward its edge, where paths from deep water outside it are missing. A breaker is half the
  open sea's significant height, at least 0.8 m so a still day has surf too
  (`setWaterShoreWaves(strength)` scales it), and grows as the
  water shallows (Green's law) until it reaches 0.78 of the depth. It comes in between 24 m and
  12 m deep. Where it breaks it steepens and pulls the water harder toward its crest, never
  folding. Noise over 64 m bends the crests and varies their height. Shore waves take up to 80%
  of the depth's height budget from the open sea, so a little chop still rides between them. They
  fade where the grid or the pixel is too coarse to hold them. `setWaterShoreDebug()` paints the
  field on the water, and `shoreFieldStats()` counts the last build's texels.
- **Foam lines.** Where a shore wave breaks, foam gathers over the last 6% of its cycle before the
  crest and trails behind it, fading by e every fifth of a cycle, so bands of white water roll in
  with the crests. It scales with how near breaking the wave is, so a calm day has a narrow surf
  line and a storm whitens the shelf. The water it lies on is flat enough that the whitecaps'
  lace would hide it on its own, so 2 m and 1 m noise joins the lace to break it into grain,
  with a sharp edge. Unlike crest foam it runs up to the waterline.
- **Swash.** After a wave breaks, a thin sheet of water runs up the beach and drains back. The
  two trains' periods are close, so together they are one wave whose height swells and fades
  over a set. Each time its crest reaches the waterline, the sheet's edge climbs to a **runup**
  of 0.4 × the breaker height × the set's swell. So a still day runs up about 0.3 m and a storm
  about 1.2 m, and the big waves of a set run farther than the small ones between. The uprush
  takes the first 30% of the cycle and eases out. The backwash takes the rest and eases in, as
  the sheet thins and soaks into the sand. Crest height noise varies the runup along the coast.
  - **Swash field.** The shore field's times rise inland at a metre-deep wave's speed, and its
    strength is 0 on land, so the swash reads a second grid over the same texels
    (`packSwashField`, `rg16float`). Reached texels keep their own time and strength. Ground up
    to 3 texels (24 m) from them takes the nearest one's, so a beach keeps time with the crests
    at its waterline. Water the waves do not reach gets none, so a lagoon behind a bar has no
    swash. Only water that takes the longest cascade, the open sea's, has swash, so a lake
    beside the sea gets none either.
  - **The sheet.** The water surface lifts by the swash height near the waterline, fading out by
    1.5 m of depth into the breaking waves. The depth test against the terrain cuts its edge, so
    the edge climbs the beach by `runup / slope`, and the sheet is thin at the edge with no extra
    work. It shows only where coverage reaches; the ocean's soft edge runs well past the beach.
  - **Thickness.** The 8 m height texture cannot resolve a sheet a few centimetres thick. The
    water reads the thickness from the gap to the scene behind it in the refraction texture, so
    the light draw binds that texture as well as the absorb draw. Foam rides the last 6 cm of
    the sheet's edge during the uprush and thins as it drains.
  - **Shared.** The swash is a function in `shore-waves.wgsl`, so the water and the terrain agree
    where the sheet is. See [Terrain changes](#terrain-changes) for the wet sand it leaves
    behind. `setWaterSwash(strength)` scales it in the console.

Breaking waves that curl over are out of scope. A heightfield cannot overhang.

### Foam

At `windiness = 1` the trees look like a strong wind, so the water must look like a storm. The
ocean's own wind speed (see [Wind](#wind)) and the rough-sea mapping make it so:

| `windiness` | Ocean wind | Water                                                          |
| ----------- | ---------- | -------------------------------------------------------------- |
| 0           | 0.5 m/s    | Calm, the swell's slow heave, no foam                          |
| 0.3         | 4 m/s      | Small waves, no foam                                           |
| 0.5         | 8 m/s      | Moderate waves, no foam                                        |
| 0.7         | 13 m/s     | Rough, the first whitecaps and small spray                     |
| 1.0         | 22 m/s     | Storm: crossing crests, whitecaps with long lace trails, big spray |

The foam comes from the ocean alone, with no texture:

- **Whitecaps.** Foam grows where the surface folds: the ocean's Jacobian, from the choppy
  displacement's derivatives. Each cascade has its own whitecap and foam amount
  (`CASCADE_FOAM`). A texel grows foam where its Jacobian falls below the whitecap, at 7.5 × amount
  a second for each unit below. It decays at `max(0.5, 10 − amount)` × 1.15 a second, in a buffer
  kept from frame to frame. The longest cascade holds the peak waves, so its foam (whitecap 0.7,
  amount 9) caps the big crests. The next (0.5, 3) adds broken chop. The short two make none. A
  calm sea never folds that far, so it makes no foam.
- **Persistence.** The foam buffer lives at the water's rest positions, so the foam rides the
  surface it formed on and is left behind as the crest moves on, thinning as it decays.
- **Sampling.** The pixel sums the cascades' foam, filtered to its footprint through the mips:
  the coverage. It is coarse (the longest cascade's texel is 2.86 m), so it only says where foam
  may show.
- **Lace.** The whole surface's stretch at the pixel, summed over every cascade at full
  resolution, says where inside that the foam shows: from none at a stretch of 1.1 to all at
  0.5. Foam shows where the lace passes `1 − coverage`, over a soft band of 0.3, so it starts on
  the spots the small waves squeeze, grows out from there as the coverage rises, and thins back
  to lace as it decays. From 0.3 m to 2.5 m of water per pixel the plain coverage takes over,
  since far out the small waves average away.
- **Per type.** The palette's foam amount scales it all, so a lake stays much calmer than the ocean
  in the same wind.
- **Shading.** All foam is scaled by an overall opacity of 0.9. It is a rough (0.6), bright
  (albedo 0.65) diffuse layer: the light draw blends
  the water's diffuse and roughness toward it, and the absorb draw hides the water beneath it.
- **Tuning.** `setOceanFoam(cascade, { whitecap, amount })` in the console changes one cascade's
  foam live.

### Sea spray

Spray rises from breaking crests near the camera (`SeaSpray`, after GodotOceanWaves).

- **Pool.** 4096 particles. A particle keeps only where and when it rose, how hard its crest
  broke and a random value, so its motion is a function of its age and the waves under it.
- **Spawning.** A compute pass gives each free particle four tries a frame at random spots within
  150 m of the camera. A spot must be open sea at least 1.5 m deep and under foam coverage of at
  least 0.75. Its chance climbs from none at windiness 0.45 to all at 0.75. Shallow water holds
  only part of the sea (see [Waves at the shore](#waves-at-the-shore)), and both the chance and
  the puff's strength scale by that share. Recycling free
  particles straight onto new spots keeps the pool busy, where scattering them evenly and culling
  most would not.
- **Open sea.** A depth mask of 64² texels over the spray's reach, from the terrain heights
  (`TerrainRenderer.sampleHeight`) and the sea level. It is rebuilt when the camera crosses a
  texel, and every second as chunks load.
- **Motion.** A puff rides the wave's displacement where it rose, lifts off it fast and falls back
  slower, drifts downwind at 2 m/s in full wind, and grows as it spreads. It fades in fast, fades
  out slow, and dissolves from its thin edges.
- **Shape by wind.** The first breaking crests throw small puffs and a storm throws big ones. The
  shape blends from moderate at windiness 0.7 and below (2 m across, 1.3 m rise, 1.6 s) to storm
  at 1 (7 m, 2.3 m, 2.6 s), fully opaque at both. Lifetimes vary ±30%.
- **Drawing.** Camera-facing quads with the `sea-spray.png` texture, after the atmosphere
  composite, premultiplied. It is lit by the sun, 4 × brighter looking toward it (droplets
  scatter forward), and by the sky's irradiance. It fades where the scene is close behind it, so
  it meets the water softly and hides behind nearer waves, and fades near the camera and at the
  edge of its reach.
- **Fog.** The composite fogs by the depth buffer, and the spray writes none, so it applies the
  scene's fog itself (`sceneFogTransmittance`, `getFogScatterColor` in `fog.wgsl`), reading the
  composite's own uniforms.
- **Shore spray.** The first quarter of the pool is kept for the shore, so the open sea cannot
  starve it. Its particles try the same random spots, and rise while a shore wave's crest is
  over the spot. The two trains' periods are close, so together they are one wave whose height
  swells and fades over a set; its crest is where their sum stands above 0.85 of that height,
  and a set's big waves throw more than the small ones between. So bursts run along the crests
  the water shows:
  - **Plumes** where water at least 2.5 m deep lies beside known land in the depth mask: rock,
    not a beach. Ground that is not loaded, or past the mask, is not land. A shore wave's crest arriving sets one off, or an open-sea crest standing 0.35 of the
    sea's significant height above rest. Their strength climbs from none at 1 m of wave height
    to all at 5 m, so a calm sea throws none and a storm throws plumes 12 m high, 1.8 × taller
    than wide, that rise fast and fall back.
  - **Surf** where a shore wave is breaking, as its crest passes, scaled by the breaker's height
    and faded in from windiness 0.3. It is carried shoreward at 0.9 of the wave's speed, so it
    keeps up with its crest, and is thrown up whole then shrinks to 0.35 of its size.
  - Both rise from the level rather than riding the open sea's displacement.
- **Tuning.** `setSeaSpray({ moderate: { ... }, storm: { ... }, surf: { ... }, impact: { ... },
  ... })` in the console.
- **Not yet.** Spray takes no shadows (cloud or terrain) and no god rays, and rises only from the
  palette's first type, the ocean.

Stretch goals: sharper foam outlines, from a shorter longest cascade (about 400 m holds every wave
the spectrum makes now) or from 512² cascades (about 4.5 × the FFT time and 125 MB of GPU memory).
Time the ocean pass first; it has no GPU timer segment yet.

### Terrain changes

The terrain shader reads the chunk's water map as well:

- **Bindings.** A chunk's terrain binds the same surface and type textures its water draws with,
  plus the chunk's base level and texel count. A chunk with no water map binds a shared dry
  texel and skips the water terms.
- **Height above the water.** Each pixel compares its own world height with the level sampled
  from the map: `h = height − level`. The level is smooth, and the pixel's height is exact, so
  the band follows the ground at full resolution. The coarse height texture is not used here.
- **Coverage gate.** The terms fade out where coverage is 0, so dry ground below a nearby level
  stays dry. A chunk whose ground comes within 2 m of a covered level keeps its water map for
  the terrain, even when no water shows in it and none draws. Otherwise the band would stop at
  that chunk's edge.
- **Caustics** on the bed (see [Lighting under water](#lighting-under-water)).

**Wet band.** Wet sand is darker, because water fills the gaps between grains, and smoother,
because a film lies on top. These change at different speeds, so the band has two parts:

- **Damp.** Below the highest runup of a set, plus 0.15 m for water that the sand draws up, the
  ground stays damp. Its albedo falls to 0.75 × and a rougher surface eases 30% of the way
  toward 0.35. It fades out over 0.3 m above that. Where there is no swash, such as on lakes,
  the reach is 0.2 × the significant height of the water's own waves, the same share of the sea
  the runup takes, plus the same 0.15 m. The reach changes with the weather, not with each wave.
- **Soaked.** Where the swash sheet has just drained, the sand is soaked. The swash height has a
  closed form over the cycle (`swashDrained`), so the time since the sheet left a given height
  is found without saved state. A sheen at roughness 0.08 sinks in by e every second. The sand
  is a further 0.7 × darker, drying by e every 3 s. So a glossy, dark band follows the backwash
  down the beach, and the sand lightens back to damp behind it. Ground under water stays
  soaked.
- **Slope.** Steep ground drains fast, so the wave reach and the soaking thin from 20° to 40° of
  slope. Rock at the waterline keeps only the 0.15 m damp line, not a wide band.
- **All materials.** The band acts on whatever the splat shows, not only on sand. The coast's
  `wetSand` material, where a climate has one, is the colour at rest. The band is the water on
  top of it. `setWaterWetBand(strength)` scales it in the console.

**Under-water tint.** The absorb draw already dims the view path from the surface to the bed.
The light that reaches the bed has passed through the water as well, and nothing dims it yet:

- **Sun.** The sun term is dimmed by `exp(−extinction × depth / cosθ)`, where θ is the sun's
  angle after it bends into the water. The extinction is the palette's, weighted by the type
  map.
- **Sky.** The ambient term is dimmed by the same extinction over 1.2 × the depth, for the slant
  paths of the sky light.
- **Soaked.** The bed takes the damp and soaked albedo, and loses its specular over its first 5 cm under
  water: sun and sky alike (`evaluateIblTerms` splits the sky's two lobes). The surface above
  gives the water's reflections, so a glint on the bed would be counted twice.

The terrain draws before the refraction capture, so the water refracts a bed that is already
tinted. The depth is the level's, not the swash's: a sheet a few centimetres thick absorbs
nothing that shows.

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
- **Debug views** as console commands: level, coverage, type weights, depth and flow.

### Water edits

Authored water is a **water edit** per chunk (`WaterEdit`), at the water map's resolution:

| Data        | Form                                   | Notes                                                                 |
| ----------- | -------------------------------------- | --------------------------------------------------------------------- |
| Authority   | `PaintMask` channel 0                  | How much of the texel the edit owns. The generated water keeps the rest. |
| Coverage    | `PaintMask` channel 1                  | The edit's own coverage. 0 with full authority removes water.         |
| Type weights | `PaintMask` channels 2 to 5           | The edit's palette weights.                                           |
| Level       | `f32` per texel                        | World height of the edit's surface. Read where the edit has authority. |
| Body ID     | `u32` per texel                        | The body the edit's water belongs to. Nearest sampled.                |

- **Blend.** The worker builds the water map from the generator, then blends the edit over it
  (`applyWaterEdit`). Each side counts by its coverage times its share of the authority, so
  removing water leaves the level alone and added water takes the edit's level, type and body.
  Scatter's water conditions read the same blend, so reeds follow an edited shore.
- **Bodies.** A body the editor makes takes an id from `editedBodyId`: never 0, and never with the
  top bit that generated lakes set. Its record is built from the edit: its level, and its spill
  height at that level until the edit rules find its rim.
- **Stamps.** `applyWaterStamp` adds water, removes it, or resets texels back to the generator,
  over a disc. A texel on a chunk edge is written in every chunk that owns it, with the same
  values, or not at all, as the paint masks are.
- **Saving.** Each chunk's edit is one blob, `{cx}_{cy}.water.bin`, beside its height snapshot
  and masks: saved locally first, then synced to the cloud with them. A chunk reads its edit
  once, on its first build.
- **Rebuilds.** An edit bumps the chunk's water edit version. The chunk's current LOD rebuilds
  and brings back the water map and the instances, and the other LODs catch up when they next
  build.
- **Console.** `addWater(x, z, radius, level)`, `removeWater(x, z, radius)` and
  `resetWater(x, z, radius)` stamp the loaded chunks and save them. Each defaults to the
  viewer's position, a 20 m radius, and 1.5 m above the ground for the level. `addWater` saves
  the new body's record.
- **Edit rules in the console.** `waterBody(x, z)` logs the record of the body that owns the
  ground at a point, and its spill height found again. `lockWater(x, z)` and `unlockWater(x, z)`
  lock or unlock that body and save the records. `settleWater(x, z, radius)` runs the edit rules
  over a disc, as a sculpt stroke does, and saves what they change. Each defaults to the viewer's
  position.

## Gameplay

- A **water query**: `sample(x, z)` gives level, depth, coverage, type weights, body ID and
  flow from the same data as the shader, and the wave height from a GPU readback.
- The readback samples the FFT displacement for a few points a frame and arrives a frame or three
  late. The displacement is sideways as well as up, so a point's height is found by solving for
  the rest position that lands on it, a few fixed-point steps.
- The player does not walk on water. Shallow water slows the player. Deep water makes the player
  swim at the surface.
- The camera knows when it is under water, from the water probe (see [Under water](#under-water)).

## Under water

When the camera goes below the surface, the view is inside the water: it fogs with the water's
own colour, the surface is seen from below, and light reaches down in shafts. Where the surface
crosses the lens, the view splits into an above-water and an under-water part. After surfacing,
drops of water stay on the lens for a few seconds. The design follows Tidewater's under-water
post-process (MIT), fitted to this renderer.

Everything below keys off one question per pixel: **is the lens in water or in air here?** The
lens is the camera's near clip plane (0.1 m). The water between the eye and the lens is clipped
away, so the view starts at the lens.

### The water probe

A compute pass evaluates the water at the camera every frame, on the GPU:

- **Level, coverage and type weights** from the water map of the chunk under the camera.
- **Wave height**: the FFT displacement moves the surface sideways as well as up, so the pass
  solves for the rest position that lands under the camera in a few fixed-point steps (as the
  water query does). Shore waves and swash are added on top.

It writes a small storage buffer that the under-water passes read in the same frame, so they
never lag. The CPU reads it back a few frames late, for the lens droplets and gameplay.

Farther than **0.35 m** from the surface, the near plane cannot reach it, and the whole view is
in the camera's medium: a single value from the probe. Only within that band can the surface
cross the lens.

### Medium at the lens

While the camera is within 0.35 m of the surface, a full-screen pass writes the medium per pixel
into an `r8unorm` texture: the point where the pixel's ray meets the near plane, tested against
the wave height at its xz (the probe's solve). The waterline on the lens is where this flips.
Outside the band the pass does not run, and the medium is the probe's.

The water draws cannot write this themselves. They share a render pass with the transparent
pipelines, and an extra attachment would have to be declared by every one of them.

### The surface from below

The water pipelines draw both faces. A back face is the surface seen from below:

- **Snell's window.** The view ray refracts out into the air (1.333 to 1). Inside the window,
  about 48.6° from straight up, it shows the sky cube along the refracted ray, and objects above
  the water from the refraction capture where they stand in front of the sky.
- **Total internal reflection.** Outside the window the surface is a mirror of the water below:
  the in-water colour of an endless ray, as the fog gives it (see [Fog in the water](#fog-in-the-water)).
- **Fresnel.** From water into air, so the window's edge brightens into the mirror.
- **Foam** from below is a dim, rough layer, lit by the light through it.
- The absorb draw replaces the scene behind with the window's transmission. The water between
  the camera and the surface is the fog's, so no depth absorption applies here.

The shore waves, whitecaps and swash are the same surface, so they show from below with no extra
work.

### Fog in the water

In the atmosphere composite, a pixel whose lens is in water takes water fog in place of the air's.
Clouds, air fog, god rays and rain are skipped for it.

- **Transmittance.** `exp(−σt × distance)` to the first thing the pixel hits: the bed, an object
  or the surface from below (water writes depth).
- **In-scatter.** Single scattering of the sun and the sky, each dimmed by the water it has
  crossed to reach that depth. Light at depth `z` is `E × exp(−σt × z / μ)`, with `μ` the cosine
  of the refracted sun. Along the view ray the depth changes linearly, so the integral has a
  closed form. It is written so both exponents stay at or below zero, so looking up through deep
  water cannot overflow.
- **Phase.** Forward scattering (Henyey-Greenstein, g 0.85) blended with 25% isotropic, so the
  water glows toward the sun.
- **Coefficients** come from the palette at the camera: `σt` is the absorption plus the
  turbidity. The scattering is set so an endless level ray returns the palette's scatter colour,
  so the sea is the same colour from above and from below.

### Light shafts

With caustics (see [Lighting under water](#lighting-under-water)), shafts of light run down
through the water:

- A half-resolution pass marches the view ray to 22 m in 20 steps, sampling the caustics at each
  step's depth, dimmed along the sun's path and the view's.
- There is no TAA over the scene to resolve the noise. So, like the god rays, the march is
  jittered per pixel, and the composite upsamples it weighted by depth, so the shafts do not
  bleed across edges.

### The waterline on the lens

- **Meniscus.** Where the medium flips, a band up to 16 px either side acts as a rounded water
  edge: samples bend away from the line, a dark contact line sits on it, and a bright rim
  follows. The composite finds the line by searching the medium texture along the screen's
  vertical, which assumes the camera does not roll.
- **Droplets.** On surfacing, drops of many sizes stay on the lens. Each is a small lens with a
  blurred, flipped view of the scene, a sky highlight and a dark edge. Small drops cling and
  evaporate. Large ones slide down after a random delay and leave a thin wet trail. The lens is
  dry after 9 s. They draw after the tonemap at output resolution, so they stay stuck to the
  lens as the view moves. Going under clears them.

### Lighting under water

- **Terrain** is dimmed by its depth already (see [Terrain changes](#terrain-changes)).
- **Standard and scatter materials** take the same sun and sky dimming, from a shared include,
  so rocks, props and seaweed under water match the bed.
- **Caustics** by photon splatting (as in Evan Wallace's WebGL Water). A fine grid over one FFT
  tile is drawn off screen. Each vertex refracts the sun ray through the wave normal there, and
  lands on a plane below. Its fragment writes the ratio of the areas on the surface and on the
  plane, with additive blending, so focusing folds into bright networks. The grid covers the
  tile plus a margin, so the result tiles without seams. Two planes, shallow and deep, blend by
  the real depth. The terrain, the materials above and the shafts all sample it.
- **Marine snow.** Specks drift in a box that wraps around the camera. Their positions are a
  hash of the instance, so there is no simulation. They drift with a slow current and sway with
  the long swell. They draw only while the view can be under water, and only below the surface.

### Cost and quality

- Nothing in this section runs while the camera is more than 0.35 m above the water, except the
  probe (one small dispatch) and the back faces, which fail the depth test from above.
- The medium pass runs only while the surface is within 0.35 m of the camera.
- The fog is a branch in the composite taken per pixel: no extra pass.
- The shafts and marine snow are the extras. They are the parts a low quality tier turns off.
  The fog, the surface from below and the waterline are not: without them the view is wrong,
  not plainer.

### Build order

1. The water probe, fog in the water, the surface from below, and the lighting of materials
   under water.
2. The medium at the lens, the meniscus and the droplets.
3. Caustics, light shafts and marine snow.

## Phases

1. **Water map and ocean.** Continent field, sea level, water map and height texture in the worker,
   `shows`, the shared grid mesh, the horizon ring, sky reflection, depth colour, beach band,
   scatter kept out of water.
2. **Lakes.** Lake cells, carving, lagoons, water body records and palette blending.
3. **Surface detail.** The FFT ocean from the wind, whitecaps, crest glow, sea spray,
   refraction, sun glint, the wet band and waves at the shore.
4. **Editor and gameplay.** Water brush, edit rules and spill height, sea channels, locked lakes,
   saved edits, water query with CPU waves, wading and swimming.
5. **Stretch.** [Under water](#under-water) (the view, the waterline on the lens, caustics),
   rain ripples on water, sharper foam, noise-channel rivers.

## Performance notes (web budget)

- **One extra full-screen copy** per frame for the refraction texture (HDR colour).
- Water patches draw only for chunks with coverage. Dry chunks cost nothing.
- Patches reuse terrain LOD. Far water uses fewer vertices and fewer waves.
- One compute pass a frame for the ocean: two transforms and the mip chains over four 256²
  cascades. The vertex shader takes a displacement sample per cascade and a swash field sample;
  the fragment shader a slope and a foam sample per cascade, one sky cube sample, two refraction
  samples and a swash field sample.
- Sea spray: one compute pass over 4096 particles (four tries each while free), and one draw of
  4096 instanced quads, most of them dropped before rasterising. The CPU rebuilds its 64² depth
  mask (4096 height samples) when the camera crosses a texel, and every second.
- The shore field rebuilds when the camera moves 128 m or ground loads: 65k height samples over
  eight frames, then a fast-sweeping solve (about 4 ms), the extension past the reached water
  (about 4 ms), and a pack and upload (about 3 ms) on three more. The swash field packs and
  uploads with the shore field.
- Terrain pixels in a chunk with a water map take a surface, a type and a swash field sample.
  Chunks without one skip them.
- The horizon ring is one draw call. Its vertices take no waves, and its pixels skip refraction.
- `QualitySettings` controls the ocean's slope mip bias.

## Open questions

- **Generated ground below sea level, inland.** Edited trenches fill only if they connect to the
  ocean. Generated terrain has no such check, because a connection is not a local question. The
  draft keeps it dry by using the continent field for coverage. Is that enough, or must generation
  prevent inland ground below sea level?
- **Wind mapping.** The foam table was tuned by eye at windiness 0.7 and 1. Check it against the
  trees at 0.3 and 0.5.
- **MSAA.** The scene depth texture is multisampled when `sampleCount > 1`. The water pass and the
  sea spray, which reads it as a plain depth texture, must resolve it or read one sample.
- **Palette size.** Ocean and lake only, or swamp as well in Phase 2?
- **Level for materials under water.** Terrain reads its chunk's water map for the level. Standard
  and scatter materials are not bound to a chunk. Sea level from the Waves uniform covers the
  ocean. Lakes need either a level map around the camera or the chunk's map bound per draw.
- **Camera roll.** The meniscus search runs along the screen's vertical. If a camera can roll,
  the search must follow the waterline's direction on screen.
