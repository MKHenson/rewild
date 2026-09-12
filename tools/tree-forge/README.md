# tree-forge

Procedural trees for the [Understory](../../docs/milestones/understory.md) scatter system. One
command writes a two-material glTF, a four-map texture template, and the registry entries the model
has to be declared through.

It exists because a forest needs variants, and hand-authoring a hundred of them is not affordable.
Every output is a pure function of the parameters plus a seed, so a variant regenerates identically
and a family of them costs one loop.

## Running it

```
node tools/tree-forge/cli.ts tools/tree-forge/templates/oak.json
node tools/tree-forge/cli.ts tools/tree-forge/templates/oak.json --watch
node tools/tree-forge/cli.ts --help
```

One file in, one tree out. The `tree.json` is the whole interface: every option is a key of it, and
the only thing the command line adds is `--watch`. Start from a preset in
[`templates/`](./templates/) — see [Templates](#templates) — and `--help` lists every key with its
default.

The sources are TypeScript and node runs them straight, stripping the types as it loads. There is no
build step and nothing to watch. That needs **node 22.18 or newer**, which is where type stripping
became the default, and the repo's `engines` says so. On anything older the tool fails to start with
an error about the file extension rather than about the node version.

`npm run ts-check` at the repo root checks this workspace along with the rest. That check is the
point of the TypeScript: `lib/templates.ts` types its output as the engine's own `ScatterLayer`,
`IGeometryTemplates` and `IMaterialsTemplate`, so a field added to any of them fails here rather
than producing a row that no longer compiles once you have pasted it in.

`name` is the only required key. Everything else has a default. Only `name` changes what a tree
looks like by itself, because the seed defaults to a hash of it; set `seed` to draw a different tree
from the same shape.

Files land in `<out>/<textureSet>/`, which is `assets/shared/nature/trees/<set>/` by default:

| File                   | What it is                                                            |
| ---------------------- | --------------------------------------------------------------------- |
| `<name>.glb`           | The model. Two primitives, bark and leaves, on one node at the origin. |
| `<name>.tree.json`     | Every key that made it, so it can be re-cut or nudged.                |
| `<name>.preview.png`   | A shaded three-quarter render. Only with `preview` set.               |
| `<set>_bark_*.webp`    | The bark image, four maps. See [The texture template](#the-texture-template). |
| `<set>_leaf_*.webp`    | The leaf image, four maps. Same four roles.                           |
| `<set>.textures.json`  | What the leaf image was painted for, read back by variants that reuse it. |

Re-running with the same `name` overwrites in place.

## The tuning loop

Every run writes `<name>.tree.json` beside the model — the **sidecar** — and prints the command that
reads it back:

```
node tools/tree-forge/cli.ts assets/shared/nature/trees/oak/oak-01.tree.json
```

So the loop is: **edit the JSON, save, look at the preview PNG**. With `--watch` the middle step
happens on every save. The file holds every key including `preview`, `out` and the seed, so nothing
has to be repeated.

The sidecar is rewritten every run with whatever was actually built. A template is never rewritten —
see below — so a preset stays a preset and the sidecar is the record of the build.

An unknown key in the file is an error rather than being ignored, because a silently dropped typo is
a change that appears not to have worked. A key that used to exist and was retired is dropped with
no complaint, so an old sidecar still opens.

## Templates

`templates/` holds the presets to reach for. Each is a complete `tree.json`, so one command builds
the tree it describes, and the file is what to copy and tweak for a new one:

```
node tools/tree-forge/cli.ts tools/tree-forge/templates/oak.json
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

What they cost:

| Tree        | Triangles | Leaf cards | Height | Canopy spread |
| ----------- | --------- | ---------- | ------ | ------------- |
| `oak-01`    | 39,844    | 5,184      | 18m    | 12.2m         |
| `poplar-01` | 24,864    | 2,880      | 18m    | 8.0m          |
| `birch-01`  | 3,436     | 672        | 16m    | 4.8m          |
| `shrub-01`  | 2,344     | 390        | 2.2m   | 1.2m          |

The tool prints the triangle count on every run. Watch it: branch count is `splits` to the power of
`branchLevels`, and leaf cards multiply that again by `leavesPerBranch`.

**Run `oak.json` before `birch.json`.** Birch carries `skipTextures: true` and names the `oak` set,
so the images have to exist before it does. Sharing one set is what makes a species cost two fetches
however many variants it has. See [Sharing one texture set](#sharing-one-texture-set-across-a-family).

`templatesDir` inside these files is unrelated: it names the engine's `templates/` at the repo root,
where `writeTemplates` patches `geometries.json` and `materials.json`.

## The shape parameters

Everything else in `--help` is either an output path, a texture setting, or a value copied straight
into the emitted scatter layer.

**The skeleton**

| Key                 | Does                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| `height`          | Total tree height in metres. The whole skeleton is normalised to it, so this is the height of the tree and not of the trunk. |
| `trunkRadius`    | Radius at the base. Not scaled by `height`, so the two are independent.      |
| `trunkTaper`     | Radius at the top of the trunk as a fraction of the base.                     |
| `splits`          | Children per split. The single biggest lever on triangle count.               |
| `splitAngle`     | Degrees a child leaves its parent by. Low is columnar, high is spreading.     |
| `splitSpread`    | How far back along the parent the children are spread from its tip. Near 0 is a fan at the end, near 1 puts branches along the whole length. |
| `branchLevels`   | Generations below the trunk.                                                  |
| `lengthRatio`    | Child length over parent length.                                              |
| `radiusRatio`    | Child radius over parent radius at the attach point.                          |
| `curve`           | Total degrees a branch bends along its own length.                            |
| `droop`           | Degrees the deepest branches bend toward the ground. **Negative bends them back upright**, which is how a crown is kept compact. |
| `segments`        | Rings along each branch. Deeper branches use fewer.                           |
| `radialSegments` | Sides of the trunk tube. Deeper branches use fewer.                           |
| `barkLevels`     | Deepest generation that gets a bark tube. Twigs beyond it carry leaves only. Default 6, every level. |

**The foliage**

| Key                  | Does                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| `leafLevels`      | How many of the deepest generations carry leaves. 1 is tips only, which goes bare on any tree with few tips. |
| `leavesPerBranch`| Cards on each leaf-bearing branch.                                           |
| `leafSize`        | Card height in metres. Absolute, so it has to come down with a small tree.   |
| `leafScale`       | Card size multiplier that leaves the texture fit alone. 1 for the model; a LOD tier trades cards for size with it. |
| `leafAspect`      | Card width over card height.                                                 |
| `leafDroop`       | Degrees a card hangs below its branch direction.                             |
| `leafFrom`        | Fraction along a branch that leaves start at.                                |
| `leafNormalMode` | `canopy` shades the crown as a rounded mass — outward from the crown's centre with the vertical lifted, so the underside faces out rather than down. `card` uses the true card normal, `up` faces every card at the sky. One normal per card in every mode. |
| `leafAlphaCutoff`| glTF `alphaCutoff` on the leaf material.                                     |

**The images**

| Key            | Does                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| `bark`         | Folders under `sources/bark/` the bark is assembled from. Empty generates it. See [Authored bark](#authored-bark). |
| `leaves`       | Folders under `sources/leaves/` whose stamps fill the leaf image. Empty generates it. See [Authored leaves](#authored-leaves). |
| `barkProfile`  | Which layer stack a *generated* bark is built from. See [Bark profiles](#bark-profiles). |
| `textureSize`  | Edge of each square image. Power of two, at least 128.                            |

**The LOD chain**

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

A tier's distance has to stay below the impostor handover the layer is emitted with, at 60% of
`cullDistance`; the engine refuses a chain that reaches past it. The tiers are written as
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

## Sharing one texture set across a family

`textureSet` names the texture family, `name` names the variant. Give a family one set and every
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

## Declaring a tree

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

Skip this step and the tree is loadable, correct, and nowhere in the world.

### 4. `templates/materials.json` — optional

A registry of textures and of **materials**, which are the settings a surface is drawn with: which
texture supplies its colour, which supplies its bumps, whether it is see-through, whether both sides
of it draw.

The `.glb` already carries its own materials, so a tree needs nothing here. The one reason to add
the block is the displacement map, and that comes with a catch. See
[Displacement](#displacement) below.

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
tools/tree-forge/sources/bark/oak/
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
bark     from tools/tree-forge/sources/bark/oak (1024px tile, 1m across)
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
tools/tree-forge/sources/leaves/oak/
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
leaves   from tools/tree-forge/sources/leaves/oak (1 stamp, 121px, 0.1m long): 10.0 per 1m card, 4x4 grid
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
of a mature pine. Each is a layer plus a profile row.

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

## Known gaps

### Displacement

glTF has no displacement slot, and `GltfMaterials` builds no `heightMap` from a file. The `_disp`
map is written and registered, but reaching it needs a `materials.json` material bound through
`materialId` — which collapses the two materials into one. Leave `parallax` off for foliage
regardless: it costs a dozen dependent taps per fragment, on the geometry that already covers the
most pixels.

### Conifer whorls

There is one branch model: children leave their parent at `splitAngle`, spread back along it by
`splitSpread`, and are placed around it by the golden angle. A spruce wants something else —
whorls of near-horizontal branches at intervals up a straight, undivided trunk. `poplar-01` above is
as close as the current model gets.

### Mip alpha erosion

Handled by the engine: every alpha-tested material scales its cutoff per mip so a card keeps the
coverage it has at the base level however far away it is (`AlphaCoverage.ts`). Nothing here has
to compensate for it, so `leafAlphaCutoff` is only about how much of a cluster reads as leaf up
close.
