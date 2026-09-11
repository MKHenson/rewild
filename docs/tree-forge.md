# tree-forge — authored texture sources

Working notes for moving [tree-forge](../tools/tree-forge/README.md) from generating its bark and
leaves to assembling them from hand-authored art. Spans more than one sitting, so the decisions are
written down rather than rediscovered. Delete it once the work has landed and the tool's own README
carries the result.

## Why

Bark is the record of a growth process, not a noise field, and a partition of Worley cells only ever
gets so close. Authored tiles get the rest of the way.

The argument that survives even if the procedural path improves is different, though: **the forge
bakes offline**. Height-based blending, stochastic tiling, multi-scale detail — the techniques that
stop tiled bark reading as tiled — are normally too expensive per fragment. Baked into an atlas they
cost nothing at runtime. This moves the work to where it is free.

The layer stack in [`lib/bark.ts`](../tools/tree-forge/lib/bark.ts) is not thrown away. `BarkSample`
carries a `u,v` that layers displace, and `knotLayer` works by shoving that coordinate so the pattern
flows past a knot. Point the displaced lookup at a bitmap instead of `plateLayer` and knots still
work — authored bark sampled at a warped coordinate is the same trick. This replaces the field, not
the stack.

## 1. The two images — done

Bark and leaves are separate images, four maps each: `<set>_bark_diff|nor|arm|disp` and
`<set>_leaf_*`. They can be, because they were already separate materials — a tree ships as two
primitives and `collectPrimitives` in
[`ScatterModels.ts`](../packages/rewild-renderer/lib/renderers/terrain/ScatterModels.ts) builds a
pass per primitive, so the second image costs one decode at load and nothing per frame.

**Bark** owns its whole image and wraps on both axes, so it carries no gutter and has no edge.
Length runs **down** the image and the ring **across** it, which is the orientation authored sources
are drawn in, so a tile lands with no rotation and no resample loss. The ring maps exactly once
across the width; length tiles under REPEAT at any branch length.

**Leaves** are a square grid of cluster cells. The generator draws 4x4 — sixteen at the same cell
resolution the eight had, since the grid no longer shares its image with the bark. A source derives
its own count — see [Packing](#packing-falls-out-of-the-declared-length). Each cell keeps its
8-texel gutter, because the neighbour across it is another leaf.

`atlas.ts` no longer describes a shared atlas: `leafCells(size, grid)` and `leafCellPixels(size,
grid)` replace `atlasRegions` and `atlasPixels`, and there is no bark region because bark has no
region to be. The grid is a parameter, and the mesh is handed the one the image was painted with.

What it bought: bark went from 1024x496 to 1024x1024 for something that repeats once per
circumference, the leaf variety doubled, the bark gutter went, and the mip chain no longer averages
bark into leaf alpha.

## 2. The source contract — done

A tree names its sources in its `tree.json` — `"bark": ["poplar"]`, `"leaves": ["oak"]` — and
`lib/sources.ts` loads them; `buildBarkCanvas` lays the tile across the image and `buildLeafCanvas`
hands stamps to `lib/cluster.ts`. An empty list generates; a listed name that is missing is an error.
The lists are what let one species' bark carry another's leaves, and `leaves` may name several
folders, whose stamps merge into one set with each keeping its own declared length. `bark` takes one
name until the height-based blend exists. The contract below is what the loader enforces, and the
tool's own README carries the authoring end of it.


```
tools/tree-forge/sources/
  bark/<name>/
  leaves/<name>/
```

Gitignored, with a **committed** `.gitignore` in each folder that carries the folder's contract, so
its shape is documented when it is empty.

Each source supplies three maps and one metadata file. **No normal map** — see below.

| Map       | Format         | Space  | Notes                                          |
| --------- | -------------- | ------ | ---------------------------------------------- |
| `diffuse` | lossless WebP  | sRGB   | Leaves carry alpha. Lossy compounds downstream. |
| `arm`     | lossless WebP  | linear | Occlusion, roughness, metallic.                |
| `disp`    | **16-bit PNG** | linear | WebP cannot carry 16 bits at all.              |

**Bark** tiles on both axes and is authored vertically — the trunk runs up the image.

**Leaves** are stamps of a single leaf, one per map set, and a folder may hold several sets. The
pivot is always bottom-middle and the tip always top-middle, so the forge can rotate one about its
stem without being told where that is. Extent comes from the alpha channel, and stamps need not be
square.

### A source declares its size in the world

A `source.json` beside the maps. Bark says how wide one tile is and how far its disp spans:

```json
{ "widthMetres": 1.2, "depthMetres": 0.03 }
```

A leaf says how long it is, stem to tip, and may say how deep its relief is:

```json
{ "lengthMetres": 0.09 }
```

`depthMetres` is optional on a leaf. With it the normal gain is derived as bark's is; without it the
settled bump strength applies, because a physically true normal for sub-millimetre relief on a card
is nearly flat, and the settled value is what reads.

Required, because it is what everything downstream is computed from rather than guessed:

- **How many times a bark tile repeats.** The ring maps once across the image, so the image width is
  one circumference; the tile repeats `circumference / widthMetres` times across it, rounded to a
  whole number so the seam still closes. `barkTile` is retired — length advances by one
  circumference per image, which makes the texture square on every branch with nothing to author.
- **How many stamps go in a cell**, and therefore what the leaf grid looks like. See
  [Assembly](#3-assembly).
- **Normal strength.** A disp that spans 3cm over a 1.2m tile has a known gradient, so
  `bumpStrength` stops being a magic number and goes the way the rest of the look values went.
- **Whether a source is good enough for the job.** Metres plus texels gives texels per metre, so the
  forge can say *this frond fills a 3m card from a 256px source* instead of leaving it to be noticed
  in-game.

A source's **pixel** size is not its world size and never decides anything but quality. The forge
scales a stamp to fit, so a 128px and a 512px leaf lay out identically and only differ in how much
detail survives. Compositing a few stamps is milliseconds against the bark band's ~1.7s, all of it
offline and once, so give it the best source there is and let it throw away what it cannot use.

### Why disp is required and normals are not

`encodeNormal(canvas, params.bumpStrength)` at
[`textures.ts:710`](../tools/tree-forge/lib/textures.ts#L710) already derives every normal from
height, so this is the existing behaviour rather than a new risk. Three reasons it is also the more
correct choice:

- **A blended normal is wrong; a normal from blended height is right.** Once two bark sources are
  height-blended, the correct normal is the gradient of the composited height. Blending two authored
  normals across that seam gives a surface that does not match its own silhouette.
- **It deletes the leaf-rotation bug.** Rotate the stamp's height, derive the normal after. Nothing
  ever rotates a tangent-space vector, which is the failure this kind of compositor reliably hits.
- **An authored normal can disagree with its own height.** Deriving makes that unrepresentable.

The condition is the 16-bit source disp. Differentiating an 8-bit heightfield gives gradient steps of
1/255 per texel, which terraces visibly on gentle slopes — the standard objection to derived normals,
and a real one. It is fully avoided if sources are 16-bit and the height stays float through
compositing. The published `_disp` can stay 8-bit; lossless WebP is 8-bit regardless, and the normal
is baked by then.

### A disp is not a desaturated diffuse

The trap, and worth stating because the result looks plausible until it is lit. A photo's brightness
is its **paint**, not its **depth**: desaturate one into a height map and every lichen bloom becomes
a bump and every stain becomes a dent, and since the normal is derived from height, that invented
geometry is what catches the light.

Correlate a candidate disp against its own diffuse luminance before trusting it. Above about 0.9 it
is a desaturation wearing a height map's name. A crevice being both dark and deep is real, so some
correlation is expected — the first oak bark source measured **0.987**, which is not that.

Where a scanned set ships its own displacement map, use it. Deriving one by hand means high-passing
the luminance to strip the broad albedo, then masking out what is bright but flat.

## 3. Assembly

**Composite in float and in linear.** Decode sRGB in, re-encode out. Blending sRGB values directly is
wrong in a way that is hard to see and impossible to unsee.

**Bark — done.** `round(circumference / widthMetres)` repeats across the ring axis, so the ring still
closes with no seam, and the same count down the length, so the tile lands square rather than
stretched. Both axes wrap, so neither needs a gutter. Sampling is bilinear and wrapped, so the repeat
count does not have to divide the image evenly.

A sourced image skips the curvature pass, which exists to stop a generated map reading as a tinted
heightfield. A photograph already carries where its own light fell, and a second pass darkens every
crevice twice.

**One thing to know before extending the loader:** sharp silently downconverts a 16-bit PNG to 8-bit
on every read path except `toColourspace('grey16')` — `raw({depth:'ushort'})` alone, `removeAlpha`,
`extractChannel` and `pipelineColourspace` all hand back the 8-bit values. Without that one call the
whole 16-bit requirement is thrown away at load time, silently, and the terracing it exists to
prevent comes back.

**Combining two bark sources must be height-based, never a lerp.** A cross-fade of two bark tiles
reads as mush; picking the greater displacement through a narrow window reads as one surface over
another. This is the reason disp is required rather than optional.

**Leaves — done.** `lib/cluster.ts` lays stamps on a spray of sprigs — a central one up from the
stem, side sprigs off its lower two thirds, a leaf at every node and a rosette at each tip — or pins
one leaf at the stem when the card holds a single leaf. Every stamp is rotated about its pivot and
scaled to its declared length. Sampling is bilinear with a supersample grid sized to the shrink, and
**alpha-weighted**, so what a source has under its cutout never reaches an edge. Compositing is
`over`, in linear. Sprigs behind are drawn first with their occlusion scaled down. Several stamps in
a set give the variety the cells used to get from noise. Leaf colour is still **dilated** under the
transparent texels afterwards, or the mip chain averages background into every edge and the
silhouette gains a dark fringe with distance.

### Packing falls out of the declared length

How many stamps go in a cell is `leafSize` over the source's `lengthMetres`, and that one division
covers cases that would otherwise be a mode flag to get wrong:

| Species | Card    | Leaf   | Stamps per cell | Grid  |
| ------- | ------- | ------ | --------------- | ----- |
| Oak     | 1m      | 0.09m  | many, on a rachis | 4x4 |
| Palm    | 3m      | 3m     | one             | 1x1 or 2x2 |

A palm frond is not a small leaf at higher resolution; it is a different relationship to the card.
One card, one frond. Nothing in the assembler needs to know that as a category — it follows from the
arithmetic.

**So the grid is derived.** Sixteen variants of a frond are worth nothing and a frond needs every
texel it can get, so a species whose leaf fills its own card gets fewer, larger cells. `leafGrid` in
`sources.ts`: four or more per card is 4x4, two to four is 2x2, under two is 1x1 — or 2x2 when the
set has several stamps to show. `fitLeaves` compares the texels a stamp lands with against the
texels it has, and the run reports an upscale rather than leaving it to be noticed in-game. Because
the card size is in the image, `leafSize` is a texture key and changing it rebuilds the images, as
are the `bark` and `leaves` lists.

Mip alpha erosion ([#230](https://github.com/MKHenson/rewild/issues/230)) is unaffected either way.

## 4. Parameters — done

The twenty look values are settled in [`lib/look.ts`](../tools/tree-forge/lib/look.ts) and are no
longer keys. They are still fields on `Params`, so `textures.ts` and `bark.ts` did not change and a
test still varies one by overriding it on the object. A `tree.json` still carrying them opens and
drops them on the next save, so nothing on disk was stranded.

The command line went with them. Every option is a key of the `tree.json`; the CLI takes the file
and, optionally, `--watch`. Presets live in `tools/tree-forge/templates/`, and a run never writes
back to one — the sidecar beside the model is the record of the build.

`barkProfile`, `textureSize`, `seed`, `leafSize` and the two source lists are what is left that
changes an image, which is why `sameTexture` almost always reuses.

`barkTile` went the same way: length advances by one circumference per image, which makes the
bark square in world space on every branch with nothing left to author.

The run states which path each image took, because a fresh clone would otherwise get procedural
art silently:

```
bark     from tools/tree-forge/sources/bark/oak (1024px tile, 1m across)
bark     generated — no sources listed
leaves   from tools/tree-forge/sources/leaves/oak (2 stamps, up to 0.25m long): 4.0 per 1m card, 4x4 grid
leaves   generated — no sources listed
```

A folder that exists and is wrong throws rather than falling back, because art that quietly did
nothing reads as the art having no effect rather than as a mistake.

## 5. Consequences to plan for

**Removing params breaks every existing sidecar.** An unknown key in a `.tree.json` is an error by
design. `oak-01.tree.json` and anything beside it stop loading the moment the flags go. Needs either
a one-time migration or a tolerant read that drops known-retired keys with a warning — otherwise the
tuning loop stops opening the files it wrote the day before.

**Reproducibility moves.** With sources gitignored, the same `tree.json` produces different textures
depending on whether the art is present on that machine. That is acceptable: reproducibility already
lives in the published output under `assets/`, pushed by `assets:push`, not in re-running the forge.
Worth being deliberate about rather than discovering.

**A shared set pins the grid.** The leaf grid follows `leafSize` and the listed sources, so a set's
images and the cards that address them have to agree. The set records the grid it was painted with
in `<set>.textures.json` beside the images, and a `skipTextures` run takes its grid from there
rather than deriving one — so a variant reusing a set can carry any `leafSize` and any source list
without its cards addressing cells nothing drew. Its lists only shape the preview.

## Open

- **A `sources:audit`.** `textures:audit` passes a source set today without checking anything that
  matters here: that the three maps and the metadata are present, that they share dimensions, that
  the disp is 16-bit rather than 8, that the diffuse is lossless, that the declared metres are
  plausible against the pixels, and that the disp is not a desaturated diffuse. Every one of those
  was a real finding on the first source set, and every one is a number a script can check.
- **Bark tile seams.** The first oak source measures 1.3x the interior step across its left/right
  wrap and 2.0x top/bottom. Well inside what reads as seamless — the generated bark's own test allows
  3x — but worth a threshold in the audit rather than an eyeball.
- **LOD tiers and impostors** are untouched by any of this, but the impostor bake reads the images —
  check it followed the split.
