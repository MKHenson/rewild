# Strata — Biome materials & distance normals

**Status:** proposed (spec for a new Strata issue; not yet built)
**Parent milestone:** [Strata](./strata.md)

## Why

Terrain colour today is a **placeholder**: `buildChunkMesh` writes height-banded
RGB into a per-chunk texture (dark green → grass → shrub → rock → snow), and
every chunk in the world is shaded with the same single hardcoded material,
`rocky-mountain-texture-seamless` (`LODMesh.ts`). Biomes drive **shape** but not
**surface** — a plain and a mountain are the same rock texture at different
heights.

This lands real per-biome materials on the terrain, blended across biome borders
and within a biome, and fixes the specific reason distant mountains look flat.

## What already exists (and is reused)

- `terrain.wgsl` already runs a **full material** — albedo + normal + specular —
  with IQ-style **stochastic "no-tile" blending** (two offset samples per map,
  mixed by a low-frequency lookup). It is simply bound to one texture set for
  the entire world.
- Each chunk already uploads its own `chunkSize²` (241²) RGBA8 texture, sampled
  by `fragUV` with a `linear-clamped` sampler. Today it holds the colour bands.
  **This is the splat map, already plumbed.**
- `generateBiomeBlendedHeightMap` already computes per-sample biome weights
  (`activeBiomes` / `activeWeights`) — and discards them.
- `perturbNormal` (`tbn.frag.wgsl`) derives its TBN from screen-space
  derivatives, so it needs no vertex tangents.
- Chunk edge samples coincide between neighbours (241 samples spanning 240
  world units), so anything derived per-sample from world position is already
  continuous across chunk borders.

## Key decisions

### Climate selects the biome; height and slope select the layer within it

This is the crux, and it is backwards from intuition. Climate is the **input**,
height is the **output**: a cold region maps to the `MOUNTAIN` row, mountain has
`heightScale: 200`, and so the terrain is tall. It is tall *because* it is a
mountain — not a mountain because it is tall. Height cannot recover "which biome
am I in", because biome height ranges overlap.

So the two questions are answered by different things:

- **Which biome** → the temperature × moisture climate model (`Biomes.ts`).
  Decides which shaping params apply and which *set* of materials is available.
- **Which material within that biome** → slope and absolute height. Snow near a
  summit, rock on steep faces, dirt in the valleys.

Today's placeholder conflates these — it colours purely by height, which only
approximates the answer because mountains happen to be the tall thing.

Shipping climate-weighted materials *without* the within-biome rules would look
**worse than the placeholder**: mountains would be uniformly rock-textured base
to summit with no snow, and since climate varies at a 3000-unit scale, a single
view would usually show one flat material. The slope/height rules are therefore
in scope here, not deferred.

### Biome → layers, not biome → material

Materials do not hang off biomes directly:

- A **material library**: `TerrainMaterial` (albedo, detail normal, macro
  normal, uvScale, specular scalar), addressed by name.
- `BiomeParams` gains `layers: string[]` — the materials that biome can use,
  plus the slope/height rule that selects between them.

This is what makes "one material per biome now, several later" a table edit
rather than a re-architecture — the same instinct as #171 landing the 2-axis
climate model early.

Initial table (4 layers total, which is the ceiling — see below):

| Biome    | Layers                | Selected by                                |
| -------- | --------------------- | ------------------------------------------ |
| plain    | grass                 | — (always)                                  |
| mountain | rock, snow, dirt      | slope (rock on steep), height (snow on top) |

### The splat map replaces the colour bands, in the texture that already exists

The per-chunk RGBA8 texture stops holding colour and starts holding **layer
weights** — R/G/B/A = weight of layers 0..3, normalised to sum to 1. Same size,
same sampler, same upload path. The height-colour bands are deleted (and with
them the only consumer of `getMaxWorldHeight` / `MAX_WORLD_HEIGHT`).

Weights are **linearly filterable**, which an index-packed encoding would not
be — this is why the splat holds four weights rather than two indices plus two
blend factors.

### The splat is derived from world position, independent of the height source

The worker's existing biome weights are tempting to just return, but they
**break on snapshots**: a sculpted chunk passes `request.heights` and skips
generation entirely, so there would be no weights.

Instead the splat is computed from a **climate-only** evaluation — a pure
function of (seed, world position, preset), two low-frequency noise samples per
texel — plus the slope/height rules read from whatever heights the chunk
actually has. This:

- costs little, and runs identically whether heights were generated or loaded;
- stays correct for sculpted chunks (you moved the ground, not the climate);
- needs **no change to the chunk snapshot format**;
- means sculpting a peak **grows snow on it for free**.

### The splat texture belongs on `TerrainChunk`, not `LODMesh`

`LODMesh.build()` currently creates the texture itself — but `buildChunkMesh`
generates it at `chunkSize²` and **never reads `lod`** (only `generateTerrainMesh`
does). So all five LODs of a chunk currently upload byte-identical 241²
textures: an existing **5× texture waste**, independent of this work.

Move it to `TerrainChunk` alongside `heights`, which is the pattern the code
already established for exactly this reason ("the in-memory truth all LOD meshes
are built from"). All LODs of a chunk share one texture.

This is also what makes painting tractable later: a brush dab becomes *mutate
`chunk.splat`, one `writeTexture`, done* — **no worker round trip, no re-mesh, no
BVH refit**, because geometry never moves. Painting is far cheaper than
sculpting. With the texture per-LOD, a dab would instead have to update five
textures per chunk and any LOD rebuild would clobber them.

### Binding N materials: a texture array

The library binds as a `texture_2d_array` — one binding, `array_index` per layer.

**Restriction: every layer's textures must share resolution and format.**
Textures are currently loaded one-by-one by name from `materials.json`, so
building array textures is the main plumbing cost in this work.

### Sample budget

The no-tile trick is 2 samples per map. Two things keep this bounded:

- **Branch on weight, using `textureSampleGrad`.** Most fragments have one or
  two non-zero layers. `textureSample` is **illegal in non-uniform control
  flow**, so `if (weight > eps) { sample }` cannot use it — `textureSampleGrad`
  can, given gradients computed once up front. Bonus: IQ's no-tile technique
  *needs* explicit gradients anyway, because the offsets jump at the `i`
  boundary and break implicit derivatives — so this also fixes a latent mip
  artefact present in the shader today.
- **Per-layer specular is a uniform scalar, not a map.** `specularMapTexture` is
  bound to `white-1x1` today — the map is unused. A scalar saves 8 samples and
  loses nothing.

Per layer: albedo (2) + detail normal (2) + macro normal (2, where present).
Typical 1–2 layers; worst case 4. **The sample budget is the main perf risk here
and should be measured, not assumed.**

### Distance-based normals (why distant mountains look flat)

The problem is not that the rock texture isn't rocky enough — it is that
**normal map mips average toward flat (0,0,1)**. At distance the GPU is deleting
the detail and returning a flat surface. High LODs compound it: fewer vertices
means a smoother geometric normal too.

The fix, per layer, is a **crossfade between two UV scales of the same map**:

- The **detail normal** at the current small scale, close up.
- A **macro normal** at a large `uvScale`, taking over with distance — its
  features stay many pixels wide, so mipping cannot erase them.
- Driven by view distance. `viewPosition` is already in the fragment shader, so
  `length(viewPosition)` is free; fade via `smoothstep(near, far, d)` with the
  bounds in `TerrainParams`.

Far → macro only → dramatic rock. Near → **detail only**.

**The macro must not be additive.** It *stands in for* the detail at range, so
it has to be invisible up close, where the detail it replaces still resolves.
An earlier revision of this doc said "near → macro + detail", and the shader
built from it kept the macro at full strength at every distance — a 240m-wide
bump visible from arm's length. Interpolate; don't add.

**Rejected: scaling the UV by distance on a single map.** It swims as the camera
moves and it shifts the no-tile offsets.

To start, the macro normal **reuses the existing**
`rocky-mountain-texture-seamless-normal` at a much larger `uvScale` — no new
assets, and the scale is tunable. It may read as self-similar (same rock at two
scales); a purpose-authored macro normal (cliff bands, strata, fracture planes)
is the upgrade if so.

**Blend tangent-space normals first, then perturb once.** The screen-space TBN in
`perturbNormal` is **invariant under uniform UV scaling** — the scale cancels
through the `normalize`. So every layer at every scale shares one TBN: weight and
combine all the tangent-space normal samples (whiteout/UDN blend for macro +
detail), then call `perturbNormal` **once**.

### One global 4-material palette now; per-chunk palettes reserved

> **Superseded — the palette is now eight materials, in two RGBA8 splat
> textures.** The desert biome was the fifth material this section predicted,
> and it took the escape hatch described below ("eight channels via a second
> splat texture") rather than per-chunk palettes. `MAX_SPLAT_LAYERS` is 8, the
> chunk owns a `splatTexture` / `splatTextureExt` pair carrying channels 0-3 and
> 4-7, and the shader binds both. Everything below still describes the reasoning
> accurately — only the number changed, and the seam analysis is the argument
> for *why* widening beat evicting. Per-chunk palettes remain reserved, for a
> library that outgrows eight simultaneously-visible materials.

RGBA8 gives four channels, so four materials. Plain's grass plus mountain's rock,
snow and dirt is exactly four — **the palette is full on day one**.

The eventual answer is a global library of N materials plus a small **per-chunk
palette** naming which ≤4 of them a chunk's channels mean. We are **not building
that now** — the global palette is the identity mapping, and with two biomes it
never overflows.

Two cheap bits of insurance so it lands later without a format break or a shader
change:

- the shader **indirects through a palette lookup** from the start (a no-op today);
- the splat header **reserves palette bytes**.

Same instinct as `CHUNK_SNAPSHOT_FLAG_COMPRESSED`: reserve it, reject it, ship
the simple thing.

#### On the per-chunk palette seam (for whoever picks this up)

Different palettes are **not** in themselves a continuity problem. The palette is
only an encoding: if chunk A stores "60% grass, 40% rock" as `(0.6, 0.4, 0, 0)`
over `[grass, rock, snow, dirt]` and chunk B stores it as `(0.6, 0.4, 0, 0)` over
`[grass, rock, snow, sand]`, both resolve to `0.6·grass + 0.4·rock`. The channels
disagree about meaning, but their weights are zero. Identical pixels.

The real condition is narrower: **every material with non-zero weight at a shared
edge must be in both palettes.** That is satisfied for free in both cases we care
about — a derived splat is a pure function of world position, so a material
visible at the edge is in that chunk's palette by construction; and a paint
stroke crossing a border writes both chunks, exactly as `applySculptStamp`
already does for heights.

The seam appears only under **overflow with divergent eviction**: a chunk needs a
fifth material, drops one, and the dropped one was visible at a border where the
neighbour kept it. So: **no overflow, no seam** — which makes it a policy
question, and gives a viable answer (*refuse the fifth*, error that the chunk is
full; Unity does essentially this). The escape hatch, if that proves too
restrictive, is eight channels via a second splat texture.

## Painting readiness

> **Partly superseded — biome painting has since landed.** It stores the biome
> _input_ (a per-chunk weight mask) rather than the material _output_, so the
> splat stayed **derived**: there is no frozen splat blob, no "painted ⇒ not
> derived", and no splat file header. Constraints 1, 2 and 4 below all held and
> were load-bearing; constraint 3 and the closing tradeoff did not apply in the
> end. See "Biome painting" in [strata.md](./strata.md). What remains genuinely
> future is **direct-material** painting, which _would_ store output weights and
> to which most of this section still applies.

Painting is a **separate, future issue**. These are constraints this work must
satisfy so painting doesn't force a rewrite — not work to do here.

`TerrainSculptController`'s whole structure (stroke lifecycle, `prefetchHeights`,
multi-chunk stamping, `endStroke` → write) transfers almost verbatim to a paint
controller, and "saved ⇒ not generated" gains a sibling: **"painted ⇒ not
derived"**, on the same OPFS/presigned-URL asset path with the same dirty/sync
semantics.

The constraints:

1. **The splat lives on the chunk** (above) — so a dab is one `writeTexture`.
2. **Heights and splat are separate blobs with independent freeze.** Baking the
   splat into `ChunkSnapshot` would mean sculpting freezes materials too — you
   would raise a peak and it would stay grass, killing the auto-snow the
   slope/height rules exist to provide. Kept separate:
   - sculpted, not painted → splat stays derived, follows the new heights;
   - painted, not sculpted → splat stored, heights still derived;
   - both → frozen independently, and the painted splat correctly ignores later
     sculpting, because painting is the user saying so explicitly.
3. **Splat resolution is carried, not assumed to be `chunkSize`.** 241 texels over
   240 world units is ~1 texel/metre — fine for derived materials and for
   sculpting (geometry smooths it out), but a paint brush at 1 texel/m will have
   visibly blocky edges. Painting will likely want 2× or 4×, so the in-memory
   splat carries its own dimensions and painting's file header records them.
4. **Palette bytes reserved** in that header, and the shader indirects through a
   palette lookup from the start (above).

Inherited tradeoff, stated rather than hidden: a single dab will freeze that
**whole chunk's** splat, including the 99% untouched. That is the same "whole,
frozen chunk" call the milestone already made for heights, and matching the
precedent beats inventing a paint-mask channel.

## Restrictions & risks

- **Seamless generation must be preserved.** The splat is derived per-sample from
  world position, so it is continuous across chunk borders by construction — but
  any shortcut that normalises or clamps per-chunk would reintroduce seams. This
  is the milestone's standing warning and it applies here.
- **Sample budget** is the main perf unknown — measure it.
- **All library textures must share resolution and format** (texture array).
- **Four layers is a hard ceiling** until per-chunk palettes land; adding a fifth
  material — including via a third biome — forces that decision.
- **`textureSample` is illegal in non-uniform control flow** — anything inside a
  weight branch must be `textureSampleGrad`.
- **Re-tuning a preset reshapes existing worlds** that use it. Already an
  accepted consequence of the milestone's "climate config is game content"
  decision; it now extends to surfaces as well as shape.

## Out of scope

- **Painting itself** — a separate issue; only its constraints are honoured here.
- **Per-chunk palettes** — reserved for, not built.
- **A third biome** — still additive on the climate model, but note it now also
  needs layer-table entries and would overflow the four-layer palette.
- **Triplanar mapping.** Planar UVs stretch on near-vertical faces; at
  `heightScale: 200` with 35–55° slopes this is visible but tolerable. A future
  fix, and not one this design blocks.
- **A purpose-authored macro normal** — the reused rock normal at a large scale
  ships first.

## Work items

In build order. [#177](https://github.com/MKHenson/rewild/issues/177) is a pure
refactor with no behaviour change, so it is independently verifiable and
everything else sits on it.

| Issue                                                                                             | Depends on   | What                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#177 — Chunk surface texture: `LODMesh` → `TerrainChunk`](https://github.com/MKHenson/rewild/issues/177) | —            | One texture per chunk, not per LOD. No visual change; texture count drops 5×.                                                                               |
| [#178 — Material table + per-biome layers + layer rule](https://github.com/MKHenson/rewild/issues/178)   | —            | `TerrainMaterial`, `BiomeParams.layers`, and the slope/height selection rule.                                                                               |
| [#179 — Climate-derived splat map](https://github.com/MKHenson/rewild/issues/179)                        | #178         | Layer weights in the per-chunk texture; delete the height-colour bands (and `getMaxWorldHeight` / `MAX_WORLD_HEIGHT` with them, if unused).                 |
| [#180 — Texture-array loader](https://github.com/MKHenson/rewild/issues/180)                             | #178         | `texture_2d_array` from `materials.json`, with a uniform resolution/format assertion.                                                                       |
| [#181 — 4-layer blend + distance normals](https://github.com/MKHenson/rewild/issues/181)                 | #179, #180   | `terrain.wgsl`: weighted blend via `textureSampleGrad`, palette indirection, tangent-space normal blend + single `perturbNormal`, macro/detail crossfade, specular as a scalar. |
| [#182 — Measure the sample budget](https://github.com/MKHenson/rewild/issues/182)                        | #181         | The main perf risk — measure on real terrain rather than trusting the arithmetic.                                                                           |

**Not a work item: a splat file header.** The splat here is *derived* — nothing
writes it to disk, so there is no file to put a header in. The header (version,
dimensions, reserved palette, reserved flags) lands with **painting**, which is
what creates the first splat blob. The in-scope part of that constraint is only
that the **in-memory splat carries its own dimensions** rather than assuming
`chunkSize`, so painting can raise the resolution later without touching every
call site.
