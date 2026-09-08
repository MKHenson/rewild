# tree-forge

Procedural trees for the [Understory](../../docs/milestones/understory.md) scatter system. One
command writes a two-material glTF, a four-map texture template, and the registry entries the model
has to be declared through.

It exists because a forest needs variants, and hand-authoring a hundred of them is not affordable.
Every output is a pure function of the parameters plus a seed, so a variant regenerates identically
and a family of them costs one loop.

## Running it

```
node tools/tree-forge/cli.ts --name oak-01 --preview 512
node tools/tree-forge/cli.ts --help
```

The sources are TypeScript and node runs them straight, stripping the types as it loads. There is no
build step and nothing to watch. That needs **node 22.18 or newer**, which is where type stripping
became the default, and the repo's `engines` says so. On anything older the tool fails to start with
an error about the file extension rather than about the node version.

`npm run ts-check` at the repo root checks this workspace along with the rest. That check is the
point of the TypeScript: `lib/templates.ts` types its output as the engine's own `ScatterLayer`,
`IGeometryTemplates` and `IMaterialsTemplate`, so a field added to any of them fails here rather
than producing a row that no longer compiles once you have pasted it in.

`--name` is the only required flag. Everything else has a default, and `--help` lists all of them
with their current values. Options are kebab-case and take `--flag value` or `--flag=value`.
`--skip-textures` and `--write-templates` take no value; the rest are numbers, apart from the paths,
`--leaf-normal-mode` and the two tints.

Only `--name` changes what a tree looks like by itself, because the seed defaults to a hash of it.
Pass `--seed` to draw a different tree from the same shape parameters.

Files land in `assets/shared/nature/trees/<texture-set>/`:

| File                 | What it is                                                            |
| -------------------- | --------------------------------------------------------------------- |
| `<name>.glb`         | The model. Two primitives, bark and leaves, on one node at the origin. |
| `<name>.tree.json`   | Every parameter that made it, so it can be re-cut or nudged.          |
| `<name>.preview.png` | A shaded three-quarter render. Only with `--preview`.                 |
| `<set>_diff.webp`    | Base colour, leaf alpha in the fourth channel. sRGB.                  |
| `<set>_nor.webp`     | Tangent-space normal. Linear.                                         |
| `<set>_arm.webp`     | Occlusion in R, roughness in G, metallic in B. Linear.                |
| `<set>_disp.webp`    | Height. Linear. See [Displacement](#displacement) — it is not wired.  |

Re-running with the same `--name` overwrites in place.

## The tuning loop

Every run writes `<name>.tree.json` beside the model and prints the command that reads it back:

```
node tools/tree-forge/cli.ts --config assets/shared/nature/trees/oak/oak-01.tree.json
```

So the loop is: generate once with `--preview 512`, then **edit the JSON, save, re-run that one
command, look at the preview PNG**. The file holds every option including `--preview`, `--out` and
the seed, so nothing has to be repeated on the command line.

Two things to know:

- **The command line still wins.** `--config x.tree.json --height 4` reads the file and then
  overrides the height, so a one-off variation needs no edit.
- **The sidecar is rewritten every run, with whatever was actually built.** That is the point of it,
  but it means an override on the command line is written back into the file. Copy a tree.json
  somewhere else if you want it kept as a fixed preset.

An unknown key in the file is an error rather than being ignored, because a silently dropped typo is
a change that appears not to have worked.

## Worked examples

Four shapes from the same generator, sharing one texture set. The first writes the textures; the
rest reuse them.

**Broad deciduous.** The defaults. A short trunk that forks low into a wide crown.

```
node tools/tree-forge/cli.ts --name oak-01 --texture-set oak --preview 512
```

**Slender and columnar.** Two-way splits climbing six generations, with a **negative** `--droop`
pulling every branch back toward vertical. That is what keeps the crown narrow: split angles
compound with depth, so without it a deep tree fans out into a disc.

```
node tools/tree-forge/cli.ts --name birch-01 --texture-set oak --skip-textures \
  --height 16 --trunk-radius 0.16 --splits 2 --split-angle 30 --split-spread 0.8 \
  --branch-levels 6 --length-ratio 0.66 --droop -30 \
  --leaf-levels 3 --leaves-per-branch 8 --leaf-size 0.55
```

**Tall and dense.** Eight short branches per split spread over 90% of their parent, so foliage
starts near the ground and carries all the way up.

```
node tools/tree-forge/cli.ts --name poplar-01 --texture-set oak --skip-textures \
  --height 18 --trunk-radius 0.26 --splits 8 --split-angle 72 --split-spread 0.9 \
  --branch-levels 3 --length-ratio 0.45 --curve 8 --droop 22 \
  --leaf-levels 2 --leaves-per-branch 8 --leaf-size 0.5 --leaf-from 0.1 --leaf-droop 80
```

**Undergrowth.** The same generator at two metres. `--bark-tile` has to come down with the tree, or
one bark repeat covers the whole shrub.

```
node tools/tree-forge/cli.ts --name shrub-01 --texture-set oak --skip-textures \
  --height 2.2 --trunk-radius 0.07 --splits 3 --split-angle 55 --split-spread 0.95 \
  --branch-levels 3 --length-ratio 0.72 --droop -20 \
  --leaf-levels 3 --leaves-per-branch 10 --leaf-size 0.26 --bark-tile 0.5
```

What those four cost:

| Tree        | Triangles | Leaf cards | Height | Canopy spread |
| ----------- | --------- | ---------- | ------ | ------------- |
| `oak-01`    | 6,748     | 1,944      | 12m    | 7.8m          |
| `birch-01`  | 3,884     | 896        | 16m    | 7.0m          |
| `poplar-01` | 28,320    | 4,608      | 18m    | 8.4m          |
| `shrub-01`  | 2,344     | 390        | 2.2m   | 1.1m          |

The tool prints the triangle count on every run. Watch it: branch count is
`--splits` to the power of `--branch-levels`, and leaf cards multiply that again by
`--leaves-per-branch`. `poplar-01` is four times the oak from one extra split.

## The shape parameters

Everything else in `--help` is either an output path, a texture setting, or a value copied straight
into the emitted scatter layer.

**The skeleton**

| Flag                | Does                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| `--height`          | Total tree height in metres. The whole skeleton is normalised to it, so this is the height of the tree and not of the trunk. |
| `--trunk-radius`    | Radius at the base. Not scaled by `--height`, so the two are independent.      |
| `--trunk-taper`     | Radius at the top of the trunk as a fraction of the base.                     |
| `--splits`          | Children per split. The single biggest lever on triangle count.               |
| `--split-angle`     | Degrees a child leaves its parent by. Low is columnar, high is spreading.     |
| `--split-spread`    | How far back along the parent the children are spread from its tip. Near 0 is a fan at the end, near 1 puts branches along the whole length. |
| `--branch-levels`   | Generations below the trunk.                                                  |
| `--length-ratio`    | Child length over parent length.                                              |
| `--radius-ratio`    | Child radius over parent radius at the attach point.                          |
| `--curve`           | Total degrees a branch bends along its own length.                            |
| `--droop`           | Degrees the deepest branches bend toward the ground. **Negative bends them back upright**, which is how a crown is kept compact. |
| `--segments`        | Rings along each branch. Deeper branches use fewer.                           |
| `--radial-segments` | Sides of the trunk tube. Deeper branches use fewer.                           |
| `--bark-tile`       | Metres of trunk per bark texture repeat. Thinner branches repeat proportionally faster, so bark stays the same shape all the way out. A **mesh** setting: it writes the model's UVs and leaves the texture files untouched. Scale it with the tree. |

**The foliage**

| Flag                 | Does                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| `--leaf-levels`      | How many of the deepest generations carry leaves. 1 is tips only, which goes bare on any tree with few tips. |
| `--leaves-per-branch`| Cards on each leaf-bearing branch.                                           |
| `--leaf-size`        | Card height in metres. Absolute, so it has to come down with a small tree.   |
| `--leaf-aspect`      | Card width over card height.                                                 |
| `--leaf-droop`       | Degrees a card hangs below its branch direction.                             |
| `--leaf-from`        | Fraction along a branch that leaves start at.                                |
| `--leaf-normal-mode` | `canopy` shades the crown as a rounded mass — outward from the crown's centre with the vertical lifted, so the underside faces out rather than down. `card` uses the true card normal, `up` faces every card at the sky. One normal per card in every mode. |
| `--leaf-alpha-cutoff`| glTF `alphaCutoff` on the leaf material.                                     |

**The texture template**

| Flag              | Does                                                                            |
| ----------------- | ------------------------------------------------------------------------------- |
| `--bark-tint`     | Base bark colour, six digit hex.                                                |
| `--leaf-tint`     | Base leaf colour, six digit hex.                                                |
| `--bark-plates`   | Bark plates around the tube. Fewer means broader slabs.                         |
| `--groove-width`  | How wide a fissure between two plates is. 0.16 is heavy, 0.07 barely there.     |
| `--groove-depth`  | How far a fissure cuts. Drives how dark it goes too. 0 leaves the plates joined. |
| `--groove-shade`  | Colour at the bottom of a fissure, as a fraction of the plate colour. Higher is lighter. |
| `--knots`         | How often a knot appears, 0..1, over a fixed grid of twelve bark cells. 0 writes none. |
| `--knot-size`     | Knot radius as a fraction of a bark cell.                                       |
| `--knot-depth`    | How hard a knot deforms the bark around it, 0..1.                               |
| `--colour-variation` | How far colour drifts along the warm-to-cool axis. 0 leaves one flat hue.    |
| `--colour-patches` | How many colour patches fit around the tube. 2 is broad sweeps, 14 is fine mottling. Whole numbers only. |
| `--roughness-variation` | Low frequency variation in gloss. 0 makes it a pure function of depth.    |
| `--lichen`        | Lichen coverage on the bark, 0..1. 0 writes none.                               |
| `--lichen-tint`   | Lichen colour, six digit hex.                                                   |
| `--leaf-serration`| How far a leaflet margin is eaten into lobes. 0 is a smooth ellipse.            |
| `--curvature`     | How hard curvature darkens crevices and bleaches ridges. 0 disables it.         |
| `--bump-strength` | Gradient gain turning the height template into the normal map.                  |
| `--texture-size`  | Edge of the square atlas. Power of two, at least 256.                           |

## Sharing one texture set across a family

`--texture-set` names the texture family, `--name` names the variant. Give a family one set and
every variant references one image, so the whole species costs one fetch, one decode and one GPU
texture:

```
node tools/tree-forge/cli.ts --name oak-01 --texture-set oak --preview 512
node tools/tree-forge/cli.ts --name oak-02 --texture-set oak --skip-textures --seed 91 --height 9
node tools/tree-forge/cli.ts --name oak-03 --texture-set oak --skip-textures --seed 42 --splits 4
```

Only the first run pays for the textures. `--skip-textures` on the rest takes about a tenth of a
second each, which is what makes a hundred variants practical.

## Declaring a tree

Nothing scans the assets folder. A model stays invisible to the engine until the files below know
about it. The tool prints every block it needs at the end of a run, ready to paste, and
`--write-templates` writes the two JSON ones for you.

### 1. `templates/geometries.json` — required

The registry of every model the engine can load. It maps a short id to a file:

```json
"oak-01": { "type": "gltf", "url": "nature/trees/oak/oak-01.glb" }
```

That id is how everything else names the model. Nothing can reference the tree until it is here.

### 2. `ScatterLayers.ts` — required

A **scatter layer** is one kind of thing the world grows: a boulder, a fern, this tree. The layer is
not the model. It is the model *plus* everything the engine needs in order to plant thousands of it:
how far away to stop drawing it, how much to vary each one's size and rotation, what shape physics
should collide against, and how it moves in wind.

Paste the printed row into the `SCATTER_LAYERS` table. The generator has already filled in the wind
block, the trunk capsule, the spacing and the impostor distance, measured off the tree it just built.

`authoredNormals: true` is in that row for every `--leaf-normal-mode` but `card`. The engine
mirrors a back face's shading normal, which is right for a normal that belongs to the face it sits
on and wrong for `canopy` and `up`, whose normals describe the crown rather than the card. Mirrored,
they point into the tree, and whichever half of the cards faces away from the camera shades black —
a half that changes as the camera moves. The flag turns the mirror off, and only for the model's
alpha-masked piece, so the trunk keeps it. Drop the line and the canopy goes patchy in the engine
while the preview still looks right.

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
| **R**   | Bend. Path distance from the root over the longest path, to `--bend-curve`. 0 at the trunk base, 1 at a leaf tip. |
| **G**   | Phase. One value per limb, constant across that limb and its leaves.    |
| **B**   | Flutter. 0 everywhere on the bark, 0 at a leaf stem rising to 1 at its tip. |

`COLOR_0` cannot also be a tint. Leave `vertexColors` off on any material a tree is drawn with.

## The texture template

1024x1024 by default, bark over leaves:

- **Top half** is bark. Length runs along `u` and tiles under a REPEAT sampler. The ring maps once
  across `v`, and the field is periodic across that band, so the trunk closes with no seam.
- Mapping the ring once across `v` fixes the texture's height to the branch's girth, so `u` is
  advanced at `trunkRadius / radius` per `--bark-tile` metres to match. Without that a twig a
  fiftieth of the trunk's girth carries the trunk's along-length scale and its bark is squashed by
  that same fiftieth. With it every branch is a scaled copy of the trunk, which is also what a real
  one is: fine bark on a twig, broad plates at the base.
- **Bottom half** is a 4x2 grid of leaf-cluster cells on alpha. A card picks its cell by hash.
- Leaf colour is **dilated** under the transparent texels, or the mip chain averages background into
  every leaf edge and the silhouette gains a dark fringe with distance.
- Both halves keep an 8-texel gutter, which holds the bleed off at close range. At low mip levels the
  halves do average into each other. The impostor tier caps how far that matters.

### How the two halves are built

Both halves come out of `lib/noise.ts`, whose every basis wraps on a stated period so an octave sum,
a domain warp and a cellular field can be combined and still tile.

**Bark** is a partition, not a sum of bumps, so it starts from **Worley** cells: `f1` domes each
plate and `f2 - f1` is the border, which is where a fissure goes. No stack of octaves produces that
structure, which is why the first version of this file read as wood grain. A low-frequency mask
varies how deep each border cuts, because bark where every border is a fissure reads as cracked mud.
The fibre inside a plate is **domain warped**, which stretches isotropic blobs into something that
looks grown rather than sprinkled.

**Knots** are scattered on a jittered wrapped grid, and what sells them is not the knot but the way
the plates and fissures **bend around** it. Every bark lookup reads at a coordinate displaced
radially away from any knot in range, so the whole pattern flows past rather than running through.
On top of that goes a raised collar where the bark healed over the stub, a sunken dead middle, and
the branch's rings showing through.

One rule if you extend this: **never read a per-knot value from the nearest knot.** Any such value
jumps wherever the nearest one changes, and the jump draws a hard straight line clean across the
trunk that is far more obvious than the knots are. Accumulate over every knot in range instead, with
a falloff that reaches exactly zero at the cutoff, and zero again at the centre where the outward
direction is undefined.

The fissures are tunable in two independent ways, because depth and darkness are not the same
thing. `--groove-depth` decides how far one cuts, and colour follows height, so a deep groove goes
dark on its own. `--groove-shade` lifts the floor that colour ramps down to, so a groove can be deep
enough to catch a shadow without bottoming out as a black line. `--groove-width` is separate again.

**Leaves** get an irregular margin from a noise field perturbing the width profile, tapered at both
ends so the narrow base and tip do not gain a bite out of them. Veins are a ridge field: a midrib
plus secondaries whose chevrons come from shearing the along-coordinate by the across one. The
mottling is warped the same way the bark fibre is.

**Both** carry **colour variation**, because a surface that only varies in brightness is the most
reliable tell that a texture was generated. `--colour-variation` sets how far it drifts and
`--colour-patches` sets how large the blotches are, which are worth separating: broad sweeps read as
weathering, fine mottling reads as dirt. The drift runs along a single warm-to-cool axis rather
than three independent channels: independent channels wander into magenta and cyan, which no bark
has ever been. Roughness gets the same treatment, and is worth as much — it changes how the surface
catches light as you move, not just how it looks in a still.

**Bark** also grows **lichen**: a warped low-frequency patch field with its own colour, its own
higher roughness and a little lift in height. `--lichen 0` for a tree that should not have any.

**Both** then go through a **curvature** pass, which darkens where the height template curves in and
bleaches where it curves out. Height alone only says how deep a texel is. Dirt in a crevice and wear
on a ridge track curvature, not depth, and this is the cheapest thing that stops a generated map
looking like a tinted heightfield. `--curvature 0` turns it off.

Two things to know before adding to this file.

**Noise periods must be whole numbers.** Every basis wraps its lattice on an integer cell count, so a
fractional period lands the wrap mid-cell and puts a seam down every trunk. That is why
`--colour-patches` is an integer and why the derived across-branch period is rounded.

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

### LOD tiers

`geometries.json` takes a `lods` array and the generator does not fill it yet. Re-running with lower
`--branch-levels` and `--leaves-per-branch` produces a tier from the same seed and the same silhouette,
so the chain is a loop away.

### Conifer whorls

There is one branch model: children leave their parent at `--split-angle`, spread back along it by
`--split-spread`, and are placed around it by the golden angle. A spruce wants something else —
whorls of near-horizontal branches at intervals up a straight, undivided trunk. `poplar-01` above is
as close as the current model gets.

### Mip alpha erosion

Distant leaves thin out until [#230](https://github.com/MKHenson/rewild/issues/230) lands. Nothing
here works around it; `--leaf-alpha-cutoff` is the lever in the meantime.
