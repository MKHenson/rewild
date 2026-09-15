# scatter-forge

Procedural scatter assets for the [Understory](../../docs/milestones/understory.md) scatter system.
One command writes a glTF, its texture set, and the registry entries the model has to be declared
through.

It exists because a world needs variants, and hand-authoring a hundred of them is not affordable.
Every output is a pure function of the parameters plus a seed, so a recorded seed regenerates a
model identically and a family of them costs one loop.

## Types

`type` picks the **structure** to grow, not the species. Oak, birch and poplar are one structure with
different keys, which is why they are templates and not types. What earns a type is a different
shape of thing entirely:

| `type` | Is | Covers |
| ------ | -- | ------ |
| `tree` | Recursive branching. Tapered tubes with cards hung on the outermost generations. | Oak, birch, poplar, and a shrub, which is the same generator at two metres |
| `clump` | Cards radiating from one point on the ground. No stem. | Grass, wildflowers, clover, reeds |

`tree` is the default, so a config written before types existed still opens unchanged. Two more are
planned and neither is written — see [Where this is going](#where-this-is-going).

Each type takes its own keys, and setting one that belongs to another is an error naming the type
that does take it. That is the same rule an unknown key gets, for the same reason: an option that
silently did nothing is a change that appears not to have worked.

## Running it

```
node tools/scatter-forge/cli.ts tools/scatter-forge/templates/oak.json
node tools/scatter-forge/cli.ts tools/scatter-forge/templates/meadow.json
node tools/scatter-forge/cli.ts tools/scatter-forge/templates/oak.json --watch
node tools/scatter-forge/cli.ts --help
```

One file in, one model out. The config is the whole interface: every option is a key of it, and
the only thing the command line adds is `--watch`. Start from a preset in
[`templates/`](./templates/) — see [Templates](#templates) — and `--help` lists every key with its
default and the types it applies to.

The sources are TypeScript and node runs them straight, stripping the types as it loads. There is no
build step and nothing to watch. That needs **node 22.18 or newer**, which is where type stripping
became the default, and the repo's `engines` says so. On anything older the tool fails to start with
an error about the file extension rather than about the node version.

`npm run ts-check` at the repo root checks this workspace along with the rest. That check is the
point of the TypeScript: `lib/templates.ts` types its output as the engine's own `ScatterLayer`,
`IGeometryTemplates` and `IMaterialsTemplate`, so a field added to any of them fails here rather
than producing a row that no longer compiles once you have pasted it in.

`name` is the only required key. Everything else has a default.

**A config with no `seed` draws a new model on every run.** The keys set the species, and the seed
picks one individual out of it, so two runs of one file give two of the same kind. The run
prints the seed it rolled and writes it into the sidecar, so one you liked is kept by copying
that number back. Pin `seed` in the file and it stops moving, which is what the five templates do.

Files land in `<out>/<textureSet>/`, which is `assets/shared/nature/trees/<set>/` for a tree and
`assets/shared/nature/clumps/<set>/` for a clump:

| File                   | What it is                                                            |
| ---------------------- | --------------------------------------------------------------------- |
| `<name>.glb`           | The model. One primitive per piece, on one node at the origin.        |
| `<name>.forge.json`    | Every key that made it, so it can be re-cut or nudged.                |
| `<name>.preview.png`   | A shaded three-quarter render. Only with `preview` set.               |
| `<name>.lods.preview.png` | The model beside every tier at one scale. Only with `preview` and `lods`. |
| `<set>_<piece>_*.webp` | One image set per piece. See [The texture template](#the-texture-template). |
| `<set>.textures.json`  | What the images were painted for, read back by variants that reuse them. |

A **piece** is one primitive: one texture set, one glTF material, one draw. It is the unit everything
downstream is keyed on, and its name is the same in the filename, in the material and on the preview
panel:

| Type    | Pieces         | Maps per piece                                       |
| ------- | -------------- | ---------------------------------------------------- |
| `tree`  | `bark`, `leaf` | Four: `_diff`, `_nor`, `_arm`, `_disp`               |
| `clump` | `blade`        | Three. No `_disp` — see [Displacement](#displacement) |

Re-running with the same `name` overwrites in place.

## The tuning loop

Every run writes `<name>.forge.json` beside the model — the **sidecar** — and prints the command that
reads it back:

```
node tools/scatter-forge/cli.ts assets/shared/nature/trees/oak/oak-01.forge.json
```

So the loop is: **edit the JSON, save, look at the preview PNG**. With `--watch` the middle step
happens on every save. The file holds every key including `preview`, `out` and the seed, so nothing
has to be repeated. A seed the CLI rolled is held for the whole watch, so only what you edit moves.

The sidecar is rewritten every run with whatever was actually built. A template is never rewritten —
see below — so a preset stays a preset and the sidecar is the record of the build.

An unknown key in the file is an error rather than being ignored, because a silently dropped typo is
a change that appears not to have worked. So is a key that belongs to another `type`, and that error
names the type that takes it. A key that used to exist and was retired is dropped with no complaint,
so an old sidecar still opens.

The sidecar only carries the keys its own type uses. A clump's never mentions `splits`, which is
what lets the file it writes be a file it can reopen.

## Templates

`templates/` holds the presets to reach for. Each is a complete config, so one command builds
the model it describes, and the file is what to copy and tweak for a new one:

```
node tools/scatter-forge/cli.ts tools/scatter-forge/templates/oak.json
```

A run never writes back to a template. The sidecar it rewrites is the one beside the model, under
`assets/shared/nature/trees/<set>/`. `--watch` follows whichever file was named, so a template can
be tuned live too.

| Template      | Is                                                                                  |
| ------------- | ----------------------------------------------------------------------------------- |
| `oak.json`    | Broad deciduous. A heavy trunk that forks low into a wide crown. Oak bark, oak leaves; writes the `oak` set. |
| `poplar.json` | Tall and dense. Eight short branches per split spread over 90% of their parent, so foliage starts near the ground and carries all the way up. **Poplar bark with oak leaves**, on its own `poplar` set — the mix-and-match case. |
| `birch.json`  | Slender and columnar. Two-way splits climbing six generations, with a **negative** `droop` pulling every branch back toward vertical — split angles compound with depth, so without it a deep tree fans out into a disc. Reuses the `oak` set. |
| `shrub.json`  | Undergrowth. The same generator at two metres, on its own `shrub` set, generated art. |
| `meadow.json` | **A clump, not a tree.** A nine-tuft patch 2.8m across, off a nine-cell generated atlas. The type's worked example, and the thing to copy for grass, clover or wildflowers. |
| `meadow-02.json` | The second patch off the **same** `meadow` set, with `skipTextures`. Twelve tufts and a different constellation, which is what stops six hundred copies of one patch reading as a pattern. Run `meadow.json` first. |

What they cost:

| Tree        | Triangles | Leaf cards | Height | Canopy spread |
| ----------- | --------- | ---------- | ------ | ------------- |
| `oak-01`    | 39,844    | 5,184      | 18m    | 12.2m         |
| `poplar-01` | 24,864    | 2,880      | 18m    | 8.0m          |
| `birch-01`  | 3,436     | 672        | 16m    | 4.8m          |
| `shrub-01`  | 2,344     | 390        | 2.2m   | 1.2m          |
| `meadow-01` | 540       | 90         | 0.38m  | 1.68m         |
| `meadow-02` | 720       | 120        | 0.32m  | 1.67m         |

The tool prints the triangle count on every run. Watch it: branch count is `splits` to the power of
`branchLevels`, and leaf cards multiply that again by `leavesPerBranch`.

**Run `oak.json` before `birch.json`, and `meadow.json` before `meadow-02.json`.** Each of the
second ones carries `skipTextures: true` and names the first one's set, so the images have to exist
before it does. Sharing one set is what makes a species cost two fetches
however many variants it has. See [Sharing one texture set](#sharing-one-texture-set-across-a-family).

`templatesDir` inside these files is unrelated: it names the engine's `templates/` at the repo root,
where `writeTemplates` patches `geometries.json` and `materials.json`.

## The parameters

Every key of the config, grouped by what it touches. `--help` prints the same list with its
defaults. A value outside a stated range stops the run with the range in the message, so tuning by
feel is safe.

Keys marked **tree** or **clump** below belong to that type alone. Everything else is shared, and a
few of the shared ones default differently per type — `cullDistance` is 160 for a tree and 50 for a
clump, and neither is a sensible fallback for the other.

**The skeleton** — `tree`

The last column reads low to high. Values named after a template are the ones that template ships.

| Key | Default | Does | What the values mean |
| --- | --- | --- | --- |
| `height` | 12 | Finished height in metres, to the topmost point. The skeleton grows first, then scales to land on this, so it sizes the tree and not the trunk. | `2.2` shrub · `12` default · `16` birch · `18` oak and poplar |
| `trunkRadius` | 0.32 | Radius at the ground, in metres. `height` never scales it, so a slender tree and a stout one of the same height differ only here. | `0.07` shrub · `0.16` birch, a whip at 16m · `0.62` oak, stout at 18m. The oak is `height / 29`, the birch `height / 100` |
| `trunkTaper` | 0.22 | Trunk radius at the top as a fraction of the base. Branches always taper to 0.28 of their own base, which this does not touch. | `0.22` birch and poplar, down to a thin leader · `0.42` oak, carries weight high · `0.9` a near-parallel pole. Within 0..1 |
| `splits` | 3 | Children grown at each fork. The largest lever on triangle count and build time. | `2` birch, a Y at every node · `3` default · `6` oak · `8` poplar, a full whorl. Branch count is `splits ^ branchLevels`, so the birch has 64 tips and the oak 1,296. Within 1..12, capped at 4096 branches |
| `splitAngle` | 38 | Degrees a child turns away from its parent. | `30` birch, narrow and upright · `38` oak · `55` shrub · `72` poplar, almost square to its parent. The trunk's first child uses a quarter of this, so the trunk carries on past its fork |
| `splitVariance` | 12 | Degrees of randomness added to each split angle, plus or minus. | `0` every fork identical and machine-made · `12` every template · `25` loose and wild |
| `splitSpread` | 0.35 | How far back from the parent's tip its children attach, as a fraction of the parent's length. | `0` every child at the tip, an umbrella · `0.35` oak, children near the ends · `0.8` birch, down most of the branch · `0.95` shrub, the whole length. High values carry foliage close to the ground |
| `branchLevels` | 4 | Generations grown below the trunk. Each one multiplies branch count by `splits`. | `3` shrub and poplar · `4` oak · `6` birch. Cheap at `splits` 2, ruinous at `splits` 8. Within 0..6 |
| `lengthRatio` | 0.62 | Child length as a fraction of its parent's. | `0.45` poplar, children far shorter, a tight dense crown · `0.62` oak · `0.72` shrub, open and sprawling · `0.85` children rival their parent and the shape falls apart |
| `radiusRatio` | 0.6 | Child radius as a fraction of the parent's radius where it attaches. | `0.4` whippy twigs off a heavy limb · `0.6` every template · `0.85` limbs nearly as thick as what carries them |
| `curve` | 14 | Total degrees a branch bends over its length. The axis is fixed per branch, so it reads as a bend and not a wobble. | `0` dead straight sticks · `8` poplar, barely bent · `14` oak and birch · `40` strongly arced. Past about 20 raise `segments` too, or the curve shows its corners |
| `droop` | 16 | Degrees the deepest branches turn toward the ground over their own length. Scaled by depth, so limbs hold their line and twigs hang. | `-30` birch, pulled hard back upright · `-20` shrub · `0` straight out · `16` oak · `22` poplar · `45` weeping. **Negative is the only way to stop a deep tree fanning into a disc** |
| `segments` | 5 | Rings along a branch's centre line, which sets how smoothly it can curve. | `2` the floor, visible corners · `5` every template · `10` for a high `curve`. The trunk gets `segments + 2`, level 1 gets `segments`, each level below loses one. Within 2..32 |
| `radialSegments` | 8 | Sides of the tube around a branch, which sets how round it looks against the sky. | `4` a LOD tier, faceted up close · `8` every template, round at any real distance · `16` a hero asset. Each level down uses one fewer, floor of 3. It adds sides to every branch at once, so cutting it saves less than it looks. Within 3..24 |
| `barkLevels` | 6 | Deepest generation that gets a bark tube. Branches past it carry leaf cards and no geometry. | `1` the oak's LOD tier, 236 bark triangles · `6` the default, every level, 29,476 on the oak. Twigs are most of the bark, so this is the strongest triangle lever a tier has. Within 0..6 |

**The foliage** — `tree`

Leaves are flat rectangles, two triangles each, with a leaf shape cut out by the alpha test. One card
stands in for a sprig, never for a single leaf.

| Key | Default | Does | What the values mean |
| --- | --- | --- | --- |
| `leafLevels` | 2 | How many generations carry cards, counted **inward from the outermost**, never out from the trunk. | `1` oak, the tips alone · `2` poplar · `3` birch and shrub. What it buys depends on `splits`. The oak's tips are 83% of its branches, so 1 to 2 adds only 17% more cards and mostly pulls foliage back along the limbs. The birch has 64 tips and cannot fill a crown from them, so 1 to 3 takes it from 768 leaf triangles to 1,344. Within 1 to `branchLevels + 1`, where the top hangs leaves off the trunk |
| `leavesPerBranch` | 18 | Cards spaced evenly along each leaf-bearing branch, from `leafFrom` to the tip. | `1` the oak's LOD tier · `4` oak and poplar · `6` birch · `10` shrub · `18` default. Total cards is this times the leaf-bearing branches, at two triangles each. A tier cuts it and raises `leafScale` to hold the crown's density |
| `leafSize` | 1 | Height of one card in metres, before `leafScale`. It also decides how many authored leaves fit a cell, see [What one division decides](#what-one-division-decides). | `0.3` shrub at 2.2m tall · `1` every tree at 16m and up. Absolute, so a small tree needs it brought down or its leaves swallow it |
| `leafScale` | 1 | Multiplies card size and leaves the texture fit alone. | `1` every model · `2` the oak's LOD tier, paired with `leavesPerBranch` 1. That pair trades 4 small cards for 1 large one at about the same coverage |
| `leafAspect` | 0.85 | Card width as a fraction of its height. The image cell is always square, so this squashes it. | `0.85` every template, narrowing the painted sprig by 15% so a cluster reads upright · `1` the art undistorted · `1.4` a wide frond |
| `leafDroop` | 55 | Degrees a card hangs below its branch direction, plus or minus 10 of randomness. | `0` laid flat along the branch · `55` oak, birch and shrub · `80` poplar, hanging steeply · `90` straight down |
| `leafFrom` | 0.15 | Fraction along a branch where the cards start. They fill from there to the tip. | `0.1` poplar, leaves almost back to the fork · `0.15` birch and shrub · `0.45` oak, inner limbs left bare and visible through the canopy |
| `leafNormalMode` | `canopy` | Which way cards face for lighting. One normal per card in every mode. | `canopy` shades the crown as a rounded mass, pointing out from its centre with the vertical lifted, so the underside faces outward and not down · `card` uses the card's true normal, which makes the crown read as a pile of flat walls · `up` faces every card at the sky |

**The images** — `tree`

| Key | Default | Does | What the values mean |
| --- | --- | --- | --- |
| `bark` | `[]` | Folders under `sources/bark/` the bark image is assembled from. See [Authored bark](#authored-bark). | `[]` generates the bark instead · `["oak"]` builds it from that folder. A folder that is listed and missing stops the run rather than falling back |
| `leaves` | `[]` | Folders under `sources/leaves/` whose stamps fill the leaf image. See [Authored leaves](#authored-leaves). | Same rule. `[]` generates them, a named folder is an error when it is absent |
| `barkProfile` | `oak` | Which layer stack a *generated* bark is built from. Ignored once `bark` names a source. See [Bark profiles](#bark-profiles). | `oak` deep fissures and flat crusty plates, for oak, ash and elm · `smooth` barely parted plates and almost no crust |
| `textureSize` | 1024 | Edge of each square map, in pixels. A power of two, at least 128. | `128` tests only, a cell holds 32 texels · `512` the floor for anything shipping · `1024` every tree template · `2048` the clump default, because a clump atlas holds every stamp at once. See [The clump atlas](#the-clump-atlas) |

**The tuft** — `clump`

A clump has no skeleton. What it has instead is an arrangement of cards on one point, and these are
all of it.

| Key | Default | Does | What the values mean |
| --- | --- | --- | --- |
| `height` | 0.35 | Finished height in metres, to the topmost point. Cards are grown and then scaled onto it, so lean and curve cannot quietly shrink the tuft. | `0.12` a lawn · `0.38` the `meadow` template · `0.9` long meadow grass |
| `tuftsPerModel` | 1 | Tufts grown into one model. Above 1 the model is a **patch**, and the placer resolves one candidate for all of them. **The cheapest density there is.** | `1` a single tuft · `9` the `meadow` template · `12` the `meadow-02` variant · `64` the ceiling. See [Patches](#patches) |
| `patchRadius` | 0 | Metres the tuft bases are spread over. Ignored at `tuftsPerModel` 1. | `0` derives it from the count and the height · `1.4` the template · `2.2` the ceiling, because a patch is posed off one terrain sample and samples are 2m apart |
| `cardsPerTuft` | 5 | Cards radiating from the tuft's centre, spread by the golden angle. **Reach for this before `footprint`.** | `1` a single plane, which shows its zero thickness the moment you walk round it · `5` the default · `6` the template · `12` a dense tussock. Two triangles per card per segment |
| `cardSegments` | 3 | Divisions up a card. | `1` the card pivots about its base as a rigid plank, because wind has weight at two corners only · `3` bends as a curve · `6` for a tall reed. The whole reason a blade is not one quad |
| `cardLean` | 18 | Degrees a card turns outward from upright over its own length. Linear in the distance along, so it opens the tuft evenly. | `0` a sheaf standing straight up · `18` the default · `45` splayed flat |
| `cardCurve` | 26 | Degrees a card bows over its length, on top of the lean. Quadratic, so it holds straight low down and bends near the tip. | `0` dead straight blades · `26` the default · `30` the template · `70` a weeping arc |
| `cardSpread` | 0.22 | How far card bases sit from the tuft centre, as a fraction of `height`. | `0` every card on one point, which reads as pinched · `0.22` the default · `0.5` a ring rather than a tuft |
| `cardAspect` | 1 | Card width as a fraction of its own height. | `1` the default, matching the square cell · `0.6` a narrower card for a tall stamp |
| `blades` | `[]` | Folders under `sources/clump/` whose stamps fill the atlas. See [Authored clumps](#authored-clumps). | `[]` generates nine tufts instead · `["meadow", "clover"]` builds the atlas from both. A folder that is listed and missing stops the run rather than falling back |

**The files and the emitted layer**

These name the outputs, or are copied into the printed `ScatterLayers.ts` row without touching the mesh.

| Key | Default | Does | What the values mean |
| --- | --- | --- | --- |
| `name` | required | The variant. Names the `.glb`, the preview and the geometry id. | `oak-01`, `oak-02` for two cuts of one species |
| `textureSet` | `name` | The texture family. Names the images and the folder every output lands in. | Give `oak-01`, `oak-02` and `oak-03` the set `oak` and the species costs two fetches however many variants exist. See [Sharing one texture set](#sharing-one-texture-set-across-a-family) |
| `seed` | rolled per run | Seeds every random choice. Absent, the CLI rolls one and the tree is new each run. | Omit it while cutting variants, then copy the rolled number out of the sidecar to keep one · set it to hold a tree still, as every template does. The same seed and keys always give a byte-identical file. Under `--watch` a rolled seed is held for the session, or every save would reshape the tree under the key being tuned |
| `out` | `assets/shared/nature/trees` | Directory the set's folder is written under. | `assets/shared/nature/clumps` for a clump |
| `assetsRoot` | `assets/shared` | Root the printed template urls are made relative to. | |
| `preview` | 0 | Edge of each shaded preview panel, in pixels. | `0` writes none · `1024` a quick check · `2056` every template. It costs a second or two, so drop it when cutting a family. With `lods` set it also writes the comparison strip, which is this wide per panel |
| `skipTextures` | `false` | Reuse the set's existing images instead of writing them. | `false` writes the set · `true` takes a variant to about a tenth of a second. The set has to exist already |
| `writeTemplates` | `false` | Patch `geometries.json` and `materials.json` in place instead of only printing them. | |
| `templatesDir` | `templates` | Where those two files live. The engine's `templates/` at the repo root, not this tool's. | |
| `cullDistance` | 160 | Metres past which the layer draws nothing. | `50` the clump default · `90` shrub · `160` the tree default · `800` oak and poplar |
| `impostorFrom` — `tree` | 0 | Metres the billboard tier takes over at. Every `lods` distance has to stay below it. | `0` derives 60% of `cullDistance` · `192` oak and poplar, which is where the trees are tuned. **Lower is cheaper**: it hands more of the world to billboards instead of meshes. Pick it from the tile rather than from the cull distance, below |
| `impostorViews` — `tree` | 8 | Views baked around the tree. At least 2. | `8` every template. More views means a smoother turn and a bigger bake |
| `impostorTile` — `tree` | 128 | Edge of one baked view, in pixels. | `128` every template. This is what decides the handover distance |
| `footprint` | 0 | Metres of clearance the placer keeps around an instance. **The most expensive number in the file.** | `0` derives it from the model's own spread · `0.7` the clump default · `9.8` the oak's. Read [Density](#density) before lowering it: candidate cost goes as one over its square |
| `scaleMin`, `scaleMax` | 0.8, 1.25 | Bounds of the random per-instance scale. | `0.8` and `1.25` every tree template, a forest of mixed ages off one model · `0.75` and `1.3` the clump default · `1` and `1` identical copies |
| `windAmplitude` | 0.4 | How far it sways, copied into the layer's `ScatterWind`. | `0` still · `0.18` the clump default · `0.4` the tree default · `8` what the shipped oak and poplar rows are actually tuned to |
| `windFrequency` | 0.45 | How fast it sways. | `0.45` the tree default · `1.1` the clump default. A blade is light and moves faster than a limb |
| `windFlutter` | 0.35 | High-frequency motion on the cutout cards only, on top of the sway. | `0` the crown moves as one mass · `0.35` the tree default · `0.7` the clump default |
| `bendCurve` | 1.6 | Exponent shaping the wind bend written into `COLOR_0.r`. See [Wind](#wind). | `1` sways evenly along its whole length, which is the clump default because a blade does · `1.6` every tree template · `3` base locked rigid, motion only in the tips |
| `leafAlphaCutoff` | 0.45 | Alpha below which a cutout pixel is thrown away. Applies to every cutout piece. | `0.2` keeps the soft edge and shows more of the rectangle behind it · `0.4` the clump default · `0.45` every tree template · `0.7` bites into the leaf shape and thins the canopy |

**The LOD chain** — `tree`

`lods` is a list of coarser tiers, nearest first. Each names the distance it takes over at and the
mesh keys it overrides — any of `radialSegments`, `barkLevels`, `leavesPerBranch` and `leafScale`:

```json
"lods": [
  { "distance": 60, "radialSegments": 4, "barkLevels": 1, "leavesPerBranch": 1, "leafScale": 2 }
]
```

Every tier is hung on the model's own skeleton, so the branching, the canopy and the height are
identical across the chain and a handover moves nothing but detail. The bark is where the triangles
are — the oak's twigs are three quarters of it — so `barkLevels` is the lever that matters, and
`leafScale` keeps the crown as dense as it was while `leavesPerBranch` cuts the cards. That one row
takes the oak from 39,844 triangles to 2,828, and it reads well enough from 60m that the shipped
trees carry no tier between. A handover is visible up close whatever the tier; the cross-fade is a
separate piece of engine work, and a middle tier only adds a second place to see it.

**Judging a tier.** With `preview` set, the run writes `<name>.lods.preview.png`: the model and every
tier side by side, labelled with their triangle counts. Every panel is fitted by one projection built
from all of them, so the trees land on the same pixels at the same scale. A per-panel fit would
redraw a tier that shed its outermost twigs slightly larger, and that scale change would read as the
handover moving a silhouette which never moved.

Read it for silhouette, not for detail. A tier is doing its job when the outline and the mass of the
crown survive and only the detail goes. The oak's tier is a fair example of the trade: `leafScale` 2
holds the crown's density on a quarter of the cards, but the larger cards spill past the model's own
outline, so the crown reads wider at 60m than it does up close.

**Where the impostor should take over.** `impostorFrom` decides it, and the useful rule is the
tile, not the cull distance. A billboard stops being enough the moment the tree covers more pixels
than `impostorTile` has, so the handover belongs at roughly:

```
impostorFrom  =  screenHeightPx / impostorTile  x  height / (2 x tan(vFov / 2))
```

At 1080p and a 50 degree vertical field of view, that is about `145 x height / impostorTile` metres.
An 18m oak on a 128px tile comes out near 160m, which is why the shipped trees hand over at 192m and
not at the 480m that 60% of their cull distance would give. Left at `0` the tool falls back to that
fraction, which suits a low bush and is far too generous for a tree.

Lower is cheaper. The mesh band is a ring, so its area grows with the square of the handover: moving
an oak from 192m out to 480m is about 6.8x the ground, and roughly 2.7M more triangles in view.

A tier's distance has to stay below the handover, whichever way it is set; the engine refuses a
chain that reaches past it. The tiers are written as
`<name>.lod1.glb`, `<name>.lod2.glb` beside the model, and the printed `geometries.json` entry and
`ScatterLayers.ts` row carry the chain.

Everything else about how the bark and leaves **look** — the tints, the plates, the fissures, the
knots, the lichen, the colour and roughness drift — is settled in [`lib/look.ts`](./lib/look.ts) and
is not a key. Those values are tuned; a run that varies them per tree produces a family that does
not look like one species, and twenty rows of `--help` for something nobody should be reaching for.
Edit that file to change them, which changes every tree at once.

They are still fields on `Params`, so nothing downstream reads them differently and a test can
override one directly to prove what it does. A `tree.json` written before they were settled still
opens; it just loses them on the next save.

## Clumps

A clump is a tuft: cards radiating from one point on the ground, and no stem. Grass, wildflowers,
clover and reeds are all one generator with different stamps.

Three things make it read as grass rather than as cardboard, and all three cost almost nothing:

**Several cards, not one.** `cardsPerTuft` defaults to 5, spread by the golden angle and each facing
outward from the tuft's axis. A single plane shows its zero thickness the moment you walk round it,
and a plane that turns to face the camera has nothing to turn about.

**Segments up a card.** Wind is a vertex displacement weighted by `COLOR_0.r`. A four-vertex quad
carries that weight at two corners, so it pivots about its base as a rigid plank. `cardSegments`
defaults to 3, which is what lets a blade bend as a curve. This is the whole reason a tuft is not
six quads.

**Normals lifted toward up.** A blade's own normal faces sideways, so it shades as a wall and the
tuft goes dark. Every vertex here takes the tuft's normal instead — mostly up, leaned outward — and
the emitted layer sets `authoredNormals: true` so the engine's back-face mirror does not turn it
inward again. That is the same trick `leafNormalMode: canopy` uses on a tree, and it closes the
"dark blades" problem in the asset rather than in a shader.

**No shader work, and none needed.** Wind is already vertex-stage and reads `COLOR_0`, which this
writes. `authoredNormals`, `faceNormalSpecular` and `specularOcclusion` already exist as layer flags,
and a clump sets all three for the reasons a tree's canopy does.

### What a clump does not get

| | Why |
| --- | --- |
| **No impostor** | A billboard is only worth baking while the model covers more pixels than the tile has. A 0.38m tuft is under a 128px tile at every distance it is still drawn at, so it culls instead. `granite_pebble` does the same. |
| **No collider** | A tuft that stops the player is worse than one they walk through. |
| **No LOD chain** | A tier would save 18 triangles. Culling at 50m is the whole budget. |
| **No `_disp` map** | Displacement is not wired at all — see [Displacement](#displacement) — and a blade's relief is under a millimetre. A `-disp` **input** is still required, because the normal is derived from it. |
| **No ground tint** | `COLOR_0` is spent on wind, and it cannot also be a tint. Blending the terrain's colour into the blade base would need a second vertex colour. Named here rather than discovered as a bug. |

`alignToNormal` is 0.6 rather than a tree's 0. Grass grows out of the surface so it leans with it,
but not the whole way, or a hillside reads as combed.

### Patches

`tuftsPerModel` above 1 grows several tufts into one model. It is the largest
lever in the tool, and the reason is where the placer spends its time.

**A candidate is per instance, not per tuft.** For every cell of every chunk it
generates, `Scatter.ts` hashes the cell, samples a height, computes a slope,
resolves the biome and samples the noise field. Nine tufts in one model pay that
once.

| | Candidates per chunk | Instances at 50m | Tufts at 50m |
| --- | --- | --- | --- |
| 1 tuft, `footprint` 0.7 | 117,551 | 3,326 | 3,326 |
| 9 tufts, `footprint` 1.6 | **22,500** | 637 | **5,729** |
| 12 tufts, `footprint` 1.8 | 17,778 | 503 | 6,036 |

Five times less placement work and almost twice the grass. The triangles go up
because there is more grass, and they were never the constraint.

**The price is that the whole patch is posed off one sample.** One height, one
slope. `alignToNormal` already tilts it onto the slope, so what is left is the
ground's *curvature* over the patch:

| Patch span | Error from the terrain's finest octave |
| --- | --- |
| 1.4m | 4 cm |
| 3.2m | 20 cm |
| 5.0m | 49 cm |

`CLUMP_MAX_PATCH_RADIUS` caps the span at 4.4m, and the reason is not taste:
**terrain samples are 2m apart**, so a patch wider than that is carrying an
error the ground never had. Two narrower variants beat one wide patch, and they
break the repeat as well.

Three things fall out of the patch that are worth knowing:

- **It is sunk further.** `yOffset` grows with `patchRadius`, because the error
  above is cheap in one direction and not the other. A tuft buried three
  centimetres still shows most of its blades. One floating three centimetres
  shows daylight underneath.
- **Its tilt is solved, not fixed.** A lean is a rotation about the origin, so
  what it costs at the rim grows with the model. 12 degrees lifts a lone tuft's
  edge by 8cm and reads as character; the same 12 degrees lifts a 3m patch's
  corner by a third of a metre. The emitted `tilt` is whatever leaves the rim
  within 8cm of the ground, which is 11 degrees for a tuft and 3 for a patch.
- **Its footprint tiles.** A patch already carries its own density, so its cells
  are about as wide as it is. A lone tuft gets twice its own radius instead:
  tiling one would be right for the look and ruinous for the count.

### Repetition is what a patch costs you

A lone tuft at a random yaw is unreadable as a repeat. A three metre
constellation of nine, repeated six hundred times in view, is spotted at once.
The eye locks onto an arrangement long before it locks onto a shape.

The fix is variants, and it eats into the win, so it is worth stating plainly.
Every layer sweeps every cell of every chunk, whatever its density:

| Patch variants | Candidates per chunk | Against one tuft per model |
| -------------- | -------------------- | -------------------------- |
| 1              | 22,500               | 5.2x cheaper               |
| 2              | 45,000               | 2.6x cheaper               |
| 3              | 67,500               | 1.7x cheaper               |
| 4              | 90,000               | 1.3x cheaper               |

**Two or three.** Still far cheaper than single tufts, with the constellation
broken up. Four is where the saving has been given back. Cut them as
`skipTextures` variants off one atlas — a tenth of a second each — and split the
biome density between them.

### The clump atlas

A clump's atlas is **one whole stamp per cell**, and that is the one place it parts company with
leaves. A leaf cell is *composed* from many stamps rotated about their own anchors, so its grid
follows from how many fit a card. A clump stamp **is** the cell, so the grid follows from how many
there are: the smallest square that holds them.

| Stamps | Grid | Cells painted | Cell edge at 1024 | at 2048 | at 4096 |
| ------ | ---- | ------------- | ----------------- | ------- | ------- |
| 4      | 2x2  | 4             | 512px             | 1024px  | 2048px  |
| 9      | 3x3  | 9             | 341px             | 683px   | 1365px  |
| 10     | 4x4  | **10**        | 256px             | 512px   | 1024px  |
| 16     | 4x4  | 16            | 256px             | 512px   | 1024px  |

**Cells painted parts company with the grid the moment the count is not a square.** Ten stamps land
in a 4x4 with six cells blank, and a card hashing into one of those would draw nothing. The count is
recorded in `<set>.textures.json` beside the grid, and the mesh is handed it, so a card never
addresses past what was drawn.

`textureSize` defaults to 2048 for a clump for that reason: the atlas holds every stamp at once, so
adding a ninth to a set of four takes every cell from half the atlas edge to a third of it. Aim for
512px a cell for anything the camera stands next to. The run prints the cell size on every build.

Cells are **square**. A tuft whose blades fan out is roughly square, so this is mostly free. A tall
reed wastes half its cell, and mixed aspects in one atlas would need a rectangle packer rather than
a grid.

### One atlas, many layers — and what that actually buys

Give every ground cover in a biome one `textureSet` and they share one image, one material and one
fetch. That is worth taking: the texel count is the same as separate images, but sixteen separate
textures would be sixteen materials, which would be sixteen primitives, which would be sixteen draws.

Two things it does **not** buy, said here rather than discovered:

- **Not fewer draws across layers.** A pass is built per `(layer, tier, primitive material)`, so two
  clump layers are still two draws whatever they share. The saving is memory and load time.
- **Not variety between instances.** The cell a card samples is baked into its UVs at forge time, so
  every instance of one model is identical apart from yaw and scale. Variety *within* a tuft is free
  — six cards, six different cells. Variety *between* tufts still costs a variant each, exactly the
  way trees cut `oak-01`, `oak-02` and `oak-03` off one set with `skipTextures`. Three variants at a
  third of the density each is fine. Ten would not be.

## Authored clumps

Clump stamps follow the same rule as leaves: folders under `sources/clump/`, named in the config's
`blades` list, the generator where the list is empty, and an error where a listed one is missing or
wrong.

```json
"blades": ["meadow"]
"blades": ["meadow", "clover", "daisy"]
```

```
tools/scatter-forge/sources/clump/meadow/
  meadow-a-diff.webp    lossless, sRGB, alpha is the cutout
  meadow-a-arm.webp     lossless, linear
  meadow-a-disp.png     16-bit greyscale, linear
  meadow-b-diff.webp    a second stamp, a second cell
  ...
  source.json
```

Every stamp in every listed folder becomes one cell. Two grass tufts and one carrying a flower are
three cells, and a card picks among them by hash.

```json
{ "heightMetres": 0.4 }
```

`heightMetres`, not `lengthMetres`. A leaf stamp declares a length because it is rotated about its
stem into a sprig; a clump stamp is never rotated, so it stands the way it was drawn and the number
says how tall it stands. `depthMetres` is optional for the same reason it is on a leaf: a blade's
relief is under a millimetre, and a physically true normal on a card is nearly flat.

The stamp's base goes on the **bottom edge, middle**, which is the same anchor a leaf uses.

### Why not one big image cut into random rectangles

A random rectangle over a combined image slices through tufts and drags background between them.
The grid is what stops that: every card gets one whole stamp, never half of two.

## Sharing one texture set across a family

Applies to every type. `textureSet` names the texture family, `name` names the variant. Give a family one set and every
variant references the same two images, so the whole species costs two fetches and two GPU textures
however many variants it has:

```json
{ "name": "oak-01", "textureSet": "oak", "bark": ["oak"], "leaves": ["oak"] }
{ "name": "oak-02", "textureSet": "oak", "skipTextures": true, "seed": 91, "height": 9 }
{ "name": "oak-03", "textureSet": "oak", "skipTextures": true, "seed": 42, "splits": 4 }
```

Only the first pays for the textures. `skipTextures` on the rest takes about a tenth of a second
each, which is what makes a hundred variants practical.

A variant that reuses a set takes the set's leaf grid from `<set>.textures.json`, the manifest the
first run wrote, so its cards address the cells that were actually painted whatever its own
`leafSize` says. Its `bark` and `leaves` lists only matter for the preview, which is shaded from
images built in memory: list the same sources as the set for a faithful one, or leave them empty
and accept a preview on generated art.

## Density

`footprint` is the most expensive number in the file, and the cost is not where it looks.

Placement is a jittered grid in global sample space. **Cell size is twice the footprint**, and a
chunk is 241 samples at 2m each, so **480 metres across**. That gives the whole arithmetic:

```
candidates per chunk  =  (480 / (2 x footprint))²
```

| `footprint` | Cell | Candidates per chunk | Drawn at a 50m cull, density 0.8 |
| ----------- | ---- | -------------------- | -------------------------------- |
| 0.25m       | 0.5m | 921,600              | 25,000                           |
| 0.5m        | 1m   | 230,400              | 6,300                            |
| 0.7m        | 1.4m | 117,600              | 3,200                            |
| 1.0m        | 2m   | 57,600               | 1,600                            |
| 2.5m        | 5m   | 9,216                | 250                              |

The hard floor is about **6cm**: below that the kill-set's 12 bits per cell axis run out and
placement throws. `granite_pebble` ships at 2.5m, and the comment on it warns about 0.8m.

**Triangles are not the problem.** A tuft is 36 of them, so 3,200 in view is 115k triangles in one
instanced draw. The two costs that bite are candidate resolution in the worker, and overdraw at
ground level, where the alpha test defeats early-Z.

**The first lever is `tuftsPerModel`.** A candidate is resolved per instance, not per tuft, so nine
tufts in one model pay for one. Nine at `footprint` 1.6 is five times less placement work than one
at 0.7, and almost twice the grass. See [Patches](#patches).

**Then `cardsPerTuft`, not `footprint`.** Candidate cost goes as one over the square of the
footprint. Card cost goes linearly. A tuft at 0.7m with 8 cards looks far denser than a tuft at
0.35m with 4, and costs a quarter of the candidate resolutions.

**And prefer one mixed layer to three thin ones.** Every active layer sweeps every cell of the chunk
independently, so three layers at density 0.3 cost three times what one layer at 0.9 costs and look
the same. Mix the cards instead: one atlas of grass, clover and daisy cells, one layer drawing from
all of them.

One thing to know before tuning grass hard: a chunk resolves every active layer over its whole
480m, with no per-layer distance gate, and chunks generate out to the furthest layer's cull distance
plus 150m. Trees put that at 950m. So a clump culling at 50m still resolves its candidates in every
chunk within 950m. It is worker-side and amortised over chunk streaming, but it is what will cap
density long before triangles do, and the fix is a per-layer generation radius in the engine rather
than a smaller footprint here.

## Declaring a model

Nothing scans the assets folder. A model stays invisible to the engine until the files below know
about it. The tool prints every block it needs at the end of a run, ready to paste, and
`writeTemplates: true` writes the two JSON ones for you.

### 1. `templates/geometries.json` — required

The registry of every model the engine can load. It maps a short id to a file:

```json
"oak-01": {
  "type": "gltf",
  "url": "nature/trees/oak/oak-01.glb",
  "lods": ["nature/trees/oak/oak-01.lod1.glb"]
}
```

That id is how everything else names the model. Nothing can reference the tree until it is here.
`lods` is the chain the tree was built with, nearest first, and is left out for a tree without one.

### 2. `ScatterLayers.ts` — required

A **scatter layer** is one kind of thing the world grows: a boulder, a fern, this tree. The layer is
not the model. It is the model *plus* everything the engine needs in order to plant thousands of it:
how far away to stop drawing it, how much to vary each one's size and rotation, what shape physics
should collide against, and how it moves in wind.

Paste the printed row into the `SCATTER_LAYERS` table. The generator has already filled in the wind
block, the trunk capsule, the spacing, the LOD handover distances and the impostor distance, measured
off the tree it just built.

`authoredNormals: true` is in that row for every `leafNormalMode` but `card`. The engine
mirrors a back face's shading normal, which is right for a normal that belongs to the face it sits
on and wrong for `canopy` and `up`, whose normals describe the crown rather than the card. Mirrored,
they point into the tree, and whichever half of the cards faces away from the camera shades black —
a half that changes as the camera moves. The flag turns the mirror off, and only for the model's
alpha-masked piece, so the trunk keeps it. Drop the line and the canopy goes patchy in the engine
while the preview still looks right.

`faceNormalSpecular: true` and `specularOcclusion: true` are in the row in every mode, for the same
piece. A card stands in for a cluster of leaves whatever its normal says: the normal decides how
much light the card gathers, but reflections have to come off the card itself, or the sun reflects
off the canopy as one polished sphere across hundreds of cards. And the leaf image's occlusion
stands in for the leaves in front of a card, which no shadow map sees, so it is allowed to shade
the highlights too. Both are generic material options in `StandardPassBase`, not foliage ones.

Two names appear in that row and they differ on purpose:

- `geometryId: 'oak-01'` — hyphens. This is the key from `geometries.json` above.
- `name: 'oak_01'` — underscores. This is the layer's own name, and it must match the key it sits
  under in the table. `validateScatterLayers` throws if the two disagree.

### 3. A biome rule — required before anything appears

Adding a layer to the library does not place a single instance. It only makes the layer *available*.
A biome has to ask for it, by adding a rule to its `scatter` array in `Biomes.ts`:

```ts
scatter: [
  { layer: 'oak_01', density: 0.6, slope: { from: 20, to: 4 } },
],
```

`layer` is the underscore name from step 2. `density` is a fraction of what the layer's `footprint`
allows, so `1` packs them as tightly as they fit and `0.6` thins that out.

The selectors (`slope`, `height`, `noise`) restrict where they grow. Each one is a ramp rather than a
cutoff, and writing `from` **higher** than `to` runs it backwards. So `{ from: 20, to: 4 }` above is
not a typo: it means none on ground of 20 degrees or steeper, fading up to all of them on ground of
4 degrees or flatter. Trees on the flat, bare hillsides.

`density` interacts with `footprint` exactly as [Density](#density) describes: it is a fraction of
what the footprint allows, so the two multiply and neither is readable alone.

Skip this step and the model is loadable, correct, and nowhere in the world.

### 4. `templates/materials.json` — optional

A registry of textures and of **materials**, which are the settings a surface is drawn with: which
texture supplies its colour, which supplies its bumps, whether it is see-through, whether both sides
of it draw.

The `.glb` already carries its own materials, so nothing here is needed. The one reason to add
the block is the displacement map, and that comes with a catch. See
[Displacement](#displacement) below.

A clump writes no `_disp` map, so its printed block is textures and an empty `materials` list.

### Leave `materialId` alone

`materialId` is an optional field on a scatter layer. It means *ignore the materials inside the
model and draw the whole thing with this one from `materials.json` instead*. It exists for models
whose own material is a bare placeholder, which is why the `granite_boulder` layer sets it.

A tree is not that case, because it deliberately ships as **two pieces with two different
materials**:

| Piece  | Drawn as                                                       |
| ------ | -------------------------------------------------------------- |
| Bark   | Solid, and only the outward-facing side of each triangle draws. |
| Leaves | Alpha tested, and both sides of each triangle draw.             |

A clump is the other case: one piece, cutout, so a `materialId` binding *would* be safe. It still
has no reason to, because the model's own material is already correct and there is no `_disp` map to
reach.

**Alpha tested** means every pixel is either drawn in full or thrown away completely, decided by the
texture's alpha channel. That is what cuts leaf shapes out of what is really a flat rectangle. It
also means the renderer cannot skip hidden pixels early, so it costs something, and it is worth
paying on leaves and pointless on a trunk. Leaves need both sides because you see them from
underneath. A trunk seen from inside is a bug.

Those are per-material settings, and `materialId` replaces every material in the model with one, per
primitive, at [`ScatterModels.ts:82`](../../packages/rewild-renderer/lib/renderers/terrain/ScatterModels.ts#L82).
So there is no setting that is right for both pieces. Either the leaves lose their cutout and become
visible solid rectangles, or the trunk pays the alpha test for nothing and turns inside out.

## Wind

`ScatterWind` is a code table row, not model metadata — the importer ignores glTF `extras`
completely. What travels in the file is `COLOR_0`, which the wind vertex stage reads directly:

| Channel | Written as                                                              |
| ------- | ----------------------------------------------------------------------- |
| **R**   | Bend. Path distance from the root over the longest path, to `bendCurve`. 0 at the trunk base, 1 at a leaf tip. |
| **G**   | Phase. One value per limb, constant across that limb and its leaves.    |
| **B**   | Flutter. 0 everywhere on the bark, 0 at a leaf stem rising to 1 at its tip. |

`COLOR_0` cannot also be a tint. Leave `vertexColors` off on any material a tree is drawn with.

## Authored bark

Bark comes from the hand-authored sources a tree lists, and is generated where it lists none. The
generator is the fallback, and what a fresh clone gets, because sources are art and art is not in
git.

A source is a folder under `sources/bark/`, and a tree names it in its `bark` list:

```json
"bark": ["poplar"]
```

One name for now. Combining two barks is a height-based blend rather than a lerp, and that is its
own piece of work; listing two is an error that says so.

```
tools/scatter-forge/sources/bark/oak/
  oak-diff.webp    lossless, sRGB
  oak-arm.webp     lossless, linear. Occlusion, roughness, metallic.
  oak-disp.png     16-bit greyscale, linear
  source.json
```

The maps are matched on their `-diff` / `-arm` / `-disp` suffix rather than on the folder's name, so
renaming a source does not mean renaming everything in it. The tile must be square and it must tile
on both axes.

**The height map has to be 16-bit**, and a PNG, because WebP cannot carry sixteen bits at all. The
normal is derived from the height rather than authored beside it, and a height differentiated from
eight bits terraces on every gentle slope. A source whose disp is 8-bit is refused rather than
quietly used.

Deriving the normal is also the more correct choice: blending two authored normals where two heights
meet gives a surface that does not match its own silhouette, and a normal that is derived after a
stamp is rotated never has to have its tangent frame rotated with it.

### `source.json`

The one thing a bitmap cannot say about itself:

```json
{ "widthMetres": 1.0, "depthMetres": 0.02 }
```

`widthMetres` is how much trunk one tile covers, and `depthMetres` is how far its height actually
cuts. Both are required, because both are computed from rather than guessed at:

- The ring maps once across the image, so the image width is **one circumference**. The tile repeats
  `round(circumference / widthMetres)` times across it — a whole number, or the seam the ring closes
  on would meet a different part of the image than it left. The same count runs down the length,
  which is what lands the tile square rather than stretched.
- `depthMetres` over the real width of a texel is the gradient the normal needs, so the bump comes
  out at the strength the bark really has instead of a number somebody liked the look of.

### What a broken source does

An **empty list** is not an error — that is the fallback working, and the run says so:

```
bark     generated — no sources listed
bark     from tools/scatter-forge/sources/bark/oak (1024px tile, 1m across)
```

A **listed** source that is missing, or that exists and is wrong, stops the run and names the
problem: no such folder, a missing map, an 8-bit height, a non-square tile, maps at different sizes,
a `source.json` that does not declare both fields. None of those fall back to generating, because
art the tree asked for and did not get should look like a mistake, not like the art having no
effect.

Note that a sourced image skips the curvature pass. That pass exists to stop a *generated* map
reading as a tinted heightfield; a photograph already carries where its own light fell, and running
it again would darken every crevice twice.

## Authored leaves

Leaves follow the same rule: folders under `sources/leaves/`, named in the tree's `leaves` list, the
generator where the list is empty, and an error where a listed one is missing or wrong.

```json
"leaves": ["oak"]
"leaves": ["oak", "poplar"]
```

The list can hold **several** folders, and every stamp in every one of them joins the set a card
draws from. Each stamp keeps the length its own folder declares, so an oak leaf and a poplar leaf on
one card are each their own size; the layout is sized by the longest. That is how a species gets
mixed foliage, and how one species' leaves go on another's bark: `poplar.json` lists poplar bark and
oak leaves.

```
tools/scatter-forge/sources/leaves/oak/
  oak-diff.webp    lossless, sRGB, alpha is the cutout
  oak-arm.webp     lossless, linear
  oak-disp.png     16-bit greyscale, linear
  source.json
```

Each map set is one **stamp**: a single leaf, drawn with its **stem at the bottom-middle and its tip
at the top-middle** of the image. That is what lets the forge rotate a leaf about its stem without
being told where the stem is. How much of the image the leaf fills is read off the alpha, so a stamp
can carry margin. A stamp need not be square. Put several sets in one folder — `oak-a-diff.webp`,
`oak-b-diff.webp` and so on — and each becomes a stamp the cells draw from.

### `source.json`

```json
{ "lengthMetres": 0.09 }
```

`lengthMetres` is how long the leaf is, stem to tip, and it is required because the whole layout is
computed from it. `depthMetres` is optional: with it the normal comes out at the gradient the leaf
really has, as bark's does; without it the settled bump strength applies, because a leaf's relief is
under a millimetre and a physically true normal on a card is nearly flat.

### What one division decides

`leafSize` over `lengthMetres` is how many leaf lengths fit the card, and that number decides
everything about the cell without a mode flag:

| Species | Card | Leaf  | Leaves per card | Cell holds            | Grid |
| ------- | ---- | ----- | --------------- | --------------------- | ---- |
| Oak     | 1m   | 0.09m | 11              | a spray of sprigs     | 4x4  |
| Palm    | 3m   | 3m    | 1               | the frond             | 1x1  |

Many leaves per card composite as a spray: a central sprig up from the stem, side sprigs fanning
off its lower two thirds, a leaf at every node and a rosette at every tip, each stamp rotated about
its stem and scaled to its declared length. Sprigs behind are drawn first and shaded down, which is
the only depth a flat card can carry. One leaf per card is the leaf itself, pinned at the stem.

The grid follows: a cell's variety comes from how its leaves are arranged, and a cell holding one
leaf has no arrangement to vary, so it gets the texels instead. Four or more per card is 4x4, two to
four is 2x2, under two is 1x1 — or 2x2 when the set has several stamps to show. The mesh is handed
the same number, so a card never addresses a cell nothing drew. Because the card size is in the
image, `leafSize` counts as a texture key and changing it rebuilds the images — as does changing
which sources are listed.

A stamp's pixel size never decides anything but quality. The forge shrinks a stamp to its place on
the card, averaging the source texels each canvas texel covers, so a 128px and a 512px leaf lay out
identically. It says when it has to go the other way:

```
leaves   from tools/scatter-forge/sources/leaves/oak (1 stamp, 121px, 0.1m long): 10.0 per 1m card, 4x4 grid
         upscaled 5.6x: a 121px stamp for 672px of card. Give it a larger source.
```

Stamps composite in float and in linear — decoded from sRGB on the way in, encoded on the way out —
and the colour is weighted by alpha as it is sampled, so whatever a source has under its cutout,
usually black, never reaches an edge. The normal is derived from the composited height afterwards,
so nothing ever rotates a tangent-space vector. Like bark, a sourced leaf image skips the curvature
pass.

## The texture template

**Two images**, each 1024x1024 by default, each written as four maps:

| Suffix  | What it is                                                           |
| ------- | -------------------------------------------------------------------- |
| `_diff` | Base colour, leaf alpha in the fourth channel. sRGB.                  |
| `_nor`  | Tangent-space normal, derived from the height. Linear.                |
| `_arm`  | Occlusion in R, roughness in G, metallic in B. Linear.                |
| `_disp` | Height. Linear. See [Displacement](#displacement) — it is not wired.  |

They are separate because they are already separate materials. A tree ships as two primitives and
the scatter path builds a pass per primitive, so a second image costs one decode at load and nothing
per frame. Sharing one cost a gutter around the bark, a mip chain that averaged bark into leaf
alpha, and half the texels each.

Below describes what the **generator** writes, which is what runs when there is no source. The
layout, the UVs and the two materials are the same either way.

**Bark** owns its whole image and wraps on both axes, so it needs no gutter and has no edge.

- Length runs **down** the image and the ring **across** it, which is the way bark reference is
  authored. Length tiles under a REPEAT sampler at any branch length; the ring maps exactly once, and
  the field is periodic across it, so the trunk closes with no seam.
- Mapping the ring once fixes the texture's width to the branch's girth, so **length advances by one
  circumference per image** to match. That makes the bark square in world space on every branch at
  every radius, with nothing to author and nothing to drift. Without it a twig a fiftieth of the
  trunk's girth would carry the trunk's along-length scale and come out squashed by that same
  fiftieth; with it every branch is a scaled copy of the trunk, which is what a real one is — fine
  bark on a twig, broad plates at the base.

**Leaves** are a square grid of cluster cells on alpha. A card picks its cell by hash.

- The generator draws 4x4 — sixteen cells rather than eight, at the same cell resolution, because
  the grid no longer shares its image with the bark. An authored source derives its own count; see
  [Authored leaves](#authored-leaves).
- Leaf colour is **dilated** under the transparent texels, or the mip chain averages background into
  every leaf edge and the silhouette gains a dark fringe with distance.
- Each cell keeps an 8-texel gutter, which holds the bleed off at close range. The neighbour across
  that gutter is another leaf, which is the only thing left for a cell to bleed into.

### How the bark is built

Both images come out of `lib/noise.ts`, whose every basis wraps on a stated period so an octave sum,
a domain warp and a cellular field can be combined and still tile.

**Bark** is a stack of layers, one per file in `lib/bark.ts`, and is described under
[Bark profiles](#bark-profiles) below.

**Knots** are scattered on a jittered wrapped grid, and what sells them is not the knot but the way
the plates and fissures **bend around** it. Every later layer reads at a coordinate displaced
radially away from any knot in range, so the whole pattern flows past rather than running through.
On top of that goes a raised collar where the bark healed over the stub, a sunken dead middle, and
the branch's rings showing through — added as a **signed offset**, not as a height blended over the
bark. Blending replaces the plates and fissures with a smooth bullseye, and a bullseye is what a
generated knot always looks like.

One rule if you extend this: **never read a per-knot value from the nearest knot.** Any such value
jumps wherever the nearest one changes, and the jump draws a hard straight line clean across the
trunk that is far more obvious than the knots are. Accumulate over every knot in range instead, with
a falloff that reaches exactly zero at the cutoff, and zero again at the centre where the outward
direction is undefined.

That is the opposite of what the plate layer does with a cell's own value, and the difference is
where the discontinuity lands. A plate's step lands on a cell border, which is exactly where the
fissure is, so it is never seen. A knot's would land in open bark.

Depth and darkness are separate values, because they are not the same thing. Depth decides how far
a fissure cuts, and colour follows how enclosed a texel is, so a deep groove goes dark on its own.
Shade lifts the floor that colour ramps down to, so a groove can be deep enough to catch a shadow
without bottoming out as a black line. Width is separate again.

**Leaves** get an irregular margin from a noise field perturbing the width profile, tapered at both
ends so the narrow base and tip do not gain a bite out of them. Veins are a ridge field: a midrib
plus secondaries whose chevrons come from shearing the along-coordinate by the across one. The
mottling is warped the same way the bark fibre is.

**Both** carry **colour variation**, because a surface that only varies in brightness is the most
reliable tell that a texture was generated. How far it drifts and how large the blotches are are separate values, and worth separating:
broad sweeps read as weathering, fine mottling reads as dirt. The drift runs along a single warm-to-cool axis rather
than three independent channels: independent channels wander into magenta and cyan, which no bark
has ever been. Roughness gets the same treatment, and is worth as much — it changes how the surface
catches light as you move, not just how it looks in a still.

**Bark** also grows **lichen**: a warped low-frequency patch field with its own colour, its own
higher roughness and a little lift in height. Coverage is settled in `look.ts`.

**Both** then go through a **curvature** pass, which darkens where the height template curves in and
bleaches where it curves out. Height alone only says how deep a texel is. Dirt in a crevice and wear
on a ridge track curvature, not depth, and this is the cheapest thing that stops a generated map
looking like a tinted heightfield. Settled in `look.ts`.

### Bark profiles

No single field is bark. An oak is flat plates at differing levels, split by deep fissures that run
along the trunk and shallow ones that interrupt them, with a crust of flakes over the exposed faces.
A birch is none of that. So `lib/bark.ts` holds a **vocabulary of layers**, `barkProfile` names an
ordered stack of them, and a species is a table row rather than a rewrite of the file.

Each layer writes the fields it owns into one `BarkSample`, and the colour pass reads those fields
rather than re-deriving anything:

| Field    | Is                                                                                |
| -------- | --------------------------------------------------------------------------------- |
| `u`, `v` | The lookup coordinate. A layer that deforms the bark displaces it, and every later layer flows with it. |
| `height` | The surface, 0..1.                                                                |
| `cavity` | 0 on an exposed face, 1 at the bottom of a fissure.                               |
| `plate`  | Per-plate random, constant across one plate.                                      |
| `grain`  | Fine tone at texel scale.                                                         |
| `wear`   | Dead tissue. Knot cores.                                                          |
| `lift`   | A signed offset staged by an early layer and settled after the layers it deforms. |

**`cavity` is the one worth understanding.** Height alone only says how deep a texel is, and a plate
sitting low is not a crevice. Shading, occluding and growing lichen from depth is what leaves a
generated map looking like a tinted heightfield, and it is why a bark that is *correct* in relief can
still read as plastic. `cavity` says how enclosed a texel is instead, which is the thing dirt, shadow
and wear actually track.

The layers that exist:

| Layer   | Does                                                                                 |
| ------- | ------------------------------------------------------------------------------------ |
| `knot`  | Displaces the lookup away from every knot in range and stages the collar as a `lift`. |
| `plate` | The structure: a partition into plates, cut apart by fissures.                       |
| `crust` | Flaking on the exposed faces.                                                        |
| `grain` | Texel-scale tone and the last of the relief.                                         |
| `lift`  | Settles whatever an earlier layer staged.                                            |

And the profiles they are composed into:

| Profile  | Is                                                                     |
| -------- | ---------------------------------------------------------------------- |
| `oak`    | Long deep fissures up the trunk, shallow interruptions across it, flat crusty plates between. Oak, ash, elm. |
| `smooth` | Barely parted plates and almost no crust.                              |

Two ideas carry the `plate` layer, and both are worth keeping if you extend it.

**A plate is a shelf at its own level, not a dome.** Its height comes from the cell's own random
value, constant across the plate. A dome per cell is the obvious thing to write and it is what makes
generated bark read as melted wax. The step between two plates is faded out by the fissure wall, so
they meet at the bottom of the crack rather than stepping against each other over one texel.

**Fissure depth follows the direction of the border**, taken from the vector between the two feature
points that own it — which is what `worleyInto` returns `nx`/`ny` for. An oak's long fissures run up
the trunk and its cross cracks only interrupt them, and that is *one* field asked which way it
points. Laying a second cellular network across the first is the obvious alternative and it produces
a fishnet: two sets of cracks of equal weight, crossing at every intersection.

Two smaller things that each cost one line and are each visible:

- The fissures wander by a **shear** — v displaced by a field that varies mostly along the trunk —
  and not by a symmetric warp. A warp squashes the lattice, and where it squashes, neighbouring
  borders merge into a broad dark smudge.
- The crust is **elongated along the branch and patchy**. Square chips read as crocodile skin, and
  spread evenly they read as a material rather than as wear.

Still to write: rings and lenticels for birch, peeling strips for cedar, and the overlapping scales
of a mature pine. Each is a layer plus a profile row. See
[Where this is going](#where-this-is-going).

Two things to know before adding to this file.

**Noise periods must be whole numbers.** Every basis wraps its lattice on an integer cell count, so a
fractional period lands the wrap mid-cell and puts a seam down every trunk. That is why the colour
patch count is an integer and why the derived across-branch period is rounded.

**An fbm does not fill 0..1.** Summing octaves
averages toward the mean, so four octaves span roughly 0.35 to 0.66 and cluster hard in the middle.
A threshold picked by eye lands outside that and the feature silently does nothing, and `raw * 2 - 1`
gives about a third of the swing it appears to. Use `signedFbm` for anything signed, and pick
thresholds against the measured range. Two features here shipped doing nothing before that was
tracked down.

The default basis is **gradient (Perlin)** noise rather than value noise, which is the reason each
octave carries structure instead of another soft blob. `valueNoise` is still exported for anything
that wants the cheaper one.

It is a **template**, not a finished asset. Repaint any map in place: the UVs, the material and
`npm run textures:audit` all keep working, because the layout is what they depend on.

Every map is lossless WebP, and the data maps are linear. `npm run textures:audit -- --strict`
passes on the output, which is what lets `assets:push` publish it.

## Where this is going

Two types are written. Two more are planned, and this section exists so the reasoning behind them
does not have to be rediscovered.

The axis is **structure**, not plant category. Species that one generator can already reach are
parameters and a template file, not types. That is why oak, birch, poplar and a shrub are four
configs and one generator, and why the list below is short.

| `type` | State | Is | Covers |
| ------ | ----- | -- | ------ |
| `tree` | Written | Recursive branching, tubes plus cards | Oak, birch, poplar, shrub, most broadleaf |
| `clump` | Written | Cards radiating from one ground point | Grass, wildflowers, clover, reeds |
| `crown` | Planned | One undivided stem, a rosette of long curved cards at the top | Palm, fern, tree fern, cycad |
| `rock` | Planned | A deformed solid. No cards, no alpha, one material | Boulder, pebble, scree |

### `crown` — palms and ferns are the same problem

A palm is not a species of tree. It breaks the branch model outright: one straight undivided stem,
no forks at all, and a rosette of fronds at the top. `branchLevels: 0` gets a bare pole, and there
is nothing to hang the fronds on.

**A fern is a palm at 0.6 metres.** Same rosette of long curved cards from one point, no stem to
speak of. It is not a clump, because a clump's cards are short, straight and interchangeable, and a
frond is long, curved and individually placed. Putting both in one type is the whole reason `crown`
is worth having rather than adding a palm mode to `tree` and a fern mode to `clump`.

What it needs that does not exist yet:

- **A stem that does not fork.** Closer to one branch of the existing skeleton than to a whole tree.
  A curved tapered tube with a bend that increases toward the top, so a palm leans.
- **Frond cards with their own curve.** A long card, segmented like a clump's, drooping over its
  length — `cardCurve` and `cardSegments` already mean the right things. The difference from a clump
  is placement: a rosette at one height, not a fan from the ground.
- **Nothing new in the texture path.** `stampsPerCell` already returns 1 when the stamp's declared
  length matches the card, which is the `Palm | 3m | 3m | 1 | the frond | 1x1` row in
  [What one division decides](#what-one-division-decides). A frond atlas is a clump atlas: one
  whole stamp per cell.

Pieces would be `bark` plus `frond`, so it reuses the tree's bark generator unchanged.

### Conifers stay inside `tree`

A spruce is not a `crown`. It has a straight undivided trunk *and* real branches, in **whorls** of
near-horizontal limbs at intervals up it, each whorl shorter than the one below.

There is one branch model today: children leave their parent at `splitAngle`, spread back along it
by `splitSpread`, and are placed around it by the golden angle. `poplar-01` is as close as it gets.

The fix is a second **branch model** inside `tree`, not a new type. Something like
`branchModel: fork | whorl`, where `whorl` places N children at one height around the trunk, steps
up by a fixed interval, and scales each whorl by its height. That is one placement function and one
key. Everything else — the bark, the leaf cards, the LOD chain, the impostor — is unchanged, which
is exactly the argument for keeping it inside the type.

`barkProfile` would want `scale` alongside `oak` and `smooth` for a mature pine, plus `rings` and
`lenticels` for birch and `peel` for cedar. Each is a layer in
[`lib/bark.ts`](./lib/bark.ts) plus a profile row — see [Bark profiles](#bark-profiles).

### `rock` — the type that shares the least

A rock has no cards, no alpha, one material, a real collider and `alignToNormal: 1`. It shares the
noise, the encoders, the preview, the sidecar loop and the templates emitter with everything else,
and shares **nothing** with the tree's skeleton or the clump's arrangement.

That is the clearest evidence the type split is in the right place: the split is at the mesh and the
texture painter, and everything either side of it is common.

Sketch: a deformed icosphere, displaced by a few octaves of the existing noise with a flattened
bottom so it beds in, and a tiling stone texture. The engine already has `granite_boulder` and
`granite_pebble` as two layers on one model, which is the pattern to emit.

### Smaller things worth keeping

- **Per-instance atlas variety.** The cell a card samples is baked into its UVs at forge time, so
  every instance of a model is identical. The instance buffer is nine floats with no room for a UV
  offset. Adding one would let a single clump layer show real variety instead of needing a variant
  per look. Engine work, not forge work.
- **A per-layer generation radius.** See the last paragraph of [Density](#density). This is the
  thing that will cap grass density.
- **Non-square atlas cells.** A tall reed wastes half its square cell. Needs a rectangle packer
  rather than a grid, and a manifest that records each cell's rect.
- **Ground-colour tinting at a blade base.** Wants a second vertex colour, since `COLOR_0` is spent
  on wind.

## Known gaps

### Displacement

glTF has no displacement slot, and `GltfMaterials` builds no `heightMap` from a file. A tree's
`_disp` map is written and registered, but reaching it needs a `materials.json` material bound
through `materialId` — which collapses the model's two materials into one. Leave `parallax` off for
foliage regardless: it costs a dozen dependent taps per fragment, on the geometry that already
covers the most pixels.

A clump writes no `_disp` map at all. Its relief is under a millimetre, so the file would be dead
weight even if the path existed. The `-disp` **source** is still required, because the normal is
derived from the height rather than authored beside it.

### Mip alpha erosion

Handled by the engine: every alpha-tested material scales its cutoff per mip so a card keeps the
coverage it has at the base level however far away it is (`AlphaCoverage.ts`). Nothing here has
to compensate for it, so `leafAlphaCutoff` is only about how much of a cluster reads as leaf up
close.
