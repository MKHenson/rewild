# scatter-forge — rocks

Design for the stone types in [scatter-forge](../tools/scatter-forge/README.md): a pebble, a rock and
an outcrop. `rock` and `pebble` are written and documented under the README's
[Rocks](../tools/scatter-forge/README.md#rocks); `outcrop` is not. The README's
[Tuning a rock](../tools/scatter-forge/README.md#tuning-a-rock) explains each key with examples. Fold
what remains into the README as it lands.

## Three types

Following the tool's rule that a type earns itself at the mesh and the texture painter:

| `type`    | Mesh                                   | Texture                                | Collider          | Clusters |
| --------- | -------------------------------------- | -------------------------------------- | ----------------- | -------- |
| `pebble`  | Scooped sphere, shallow, light noise   | Unique bake per pebble, own block      | None              | Yes      |
| `rock`    | Scooped sphere, field grooves          | Unique bake: grain, cracks, weathering | One convex hull   | No       |
| `outcrop` | A stack of convex slabs                | Tiled stone; the cracks are geometry   | One hull per slab | No       |

`pebble` and `rock` share the mesh generator **and** the painter, and differ in how many stones one
model holds and in what the layer emits.
`outcrop` shares the painter's ingredients and nothing of the mesh. All three share the noise, the
encoders, the preview, the sidecar loop and the templates emitter, and none of them touch the
tree's skeleton or the clump's arrangement.

## The rock is a field, not a mesh

A crack must not stop at a UV seam, and the geometry should carry the same features the texture
does. Both follow from one decision: the rock is a function of 3D position, and the mesh and the
textures are evaluated from that same function.

- **`shape(d)`** — the surface distance along direction `d` from the rock's centre. A sphere with
  larger **spheres scooped out** of it for the concave faces and ridges of broken, worn stone (each
  placed so its silhouette from the centre lies outside the rock, so none overhangs), a 3D pile of
  bevelled, bedded slabs for the planes rock breaks along, low-frequency 3D fbm and ridged noise for
  what is left, and the lowest octave of the crack field as grooves. The result is star-shaped in
  the geometric sense: every point on the surface is visible from the centre, so a ray from the
  centre meets the surface exactly once and `shape(d)` has one value.
- **`detail(p, n)`** — evaluated at a surface point and its normal: grain, cracks, weathering. Yields
  height, albedo, roughness and occlusion.

The mesh samples `shape` at its vertex directions. The bake samples `shape` and then `detail` at each
texel. A crack is a 3D field at a world point and cannot know where a seam is, so it continues across
one by construction, and the grooves in the silhouette are the same lines as the cracks in the
texture because they come from the same octaves.

`noise.ts` is a periodic 2D lattice. This needs a 3D gradient basis and a 3D Worley, neither of
which wraps.

## The base mesh is a subdivided cube

A subdivided cube whose vertices are directions, each pushed out to `shape(d)`. The cube is the
parameterisation, not the shape: the shape is the scooped sphere above, scaled by the extents.
`scoops`, `scoopSize` and `scoopDepth` set the faces, and the noise keys set the octaves and
amplitude. A pebble is a few shallow scoops at low amplitude; a fractured boulder a dozen deep
ones; a slab a squashed aspect.

There is no flattened base. A rock beds in through the layer's `yOffset` and `alignToNormal: 1`,
which is what `granite_boulder` already does, and an underside that is as shaped as the top gives a
rock on a slope something to show.

What the cube base buys:

- **The UV map is the cube projection.** `uv → face → direction → shape(d) → p` is analytic, so the
  bake is a per-texel evaluation with no rasterising of triangles into UV space, and supersampling
  is more evaluations.
- **The gutter is real surface.** A texel at `u = 1.02` on face +X is a direction just past that
  face's edge, which is a point on the neighbouring face. Each face's gutter is baked with the
  surface that actually continues there, in this face's tangent frame, so cracks run into the gutter
  and the mip chain never averages a foreign colour into an edge. No dilation.
- **LODs share the textures.** A lower subdivision of the same cube has identical UVs. The chain
  costs nothing and the impostor path is unchanged.
- No pole pinching and no irregular valence. A tangent-warped cube mapping evens out texel density at
  the corners if it shows.

Six charts make one **block**, in 3×2. A rock is one block, so its image is 3×2 charts. A pebble
cluster is one block per pebble, in a grid of blocks. One piece either way:
`{ key: 'stone', cutout: false, height: true, material: true }`, because a piece is a draw and not
an object.

The gutter is a fraction of the chart rather than a fixed count of texels. A rock's 512px chart keeps
the 8 texels it has always had. A pebble's 64px chart takes 2, which is the same span of mip chain
and still the two texels a bilinear tap at an edge needs.

## Textures

Everything below is a function of `p` and `n`. Nothing reads a UV.

**Grain.** A 3D cellular field at crystal scale, each cell one of three minerals at its own colour,
roughness and height, over a texel-scale grit. Or an authored tiling stone set under `sources/rock/<name>`
sampled triplanar in the bake — three taps weighted by `|n|`, free offline. Same contract as bark:
`diffuse`, `arm`, 16-bit `disp`, and a `source.json` with `widthMetres` and `depthMetres`.

**Cracks.** 3D Worley `F2 − F1` gives cell edges; a threshold on it gives a line of a width. Two
octaves with shrinking cells and shrinking widths give the branching. The cells are flattened along
the bedding normal so the borders run with the bedding, and the cell coordinates are domain-warped
so lines wander. A slow noise along the network gates which borders are cracks and how wide each is.
A crack writes depth into the height, darkens the albedo, raises roughness and lowers occlusion, and
iron seeps from it. Its lowest octave alone also displaces the mesh: the fine one is under a quad
and reads as dimples.

**Bedding laminae.** *Written.* The stack of beds a sedimentary rock was laid down in, and the one
component here that is a function of a single number: the distance along the bedding normal. A bed
runs the whole width of the rock, so it cannot come from the 3D cellular fields the plates and the
cracks use, which give cells with an extent in every direction.

Read at two scales. A **bed** is `laminaeSize`; eight of them are a **package**, the group that
shares a hardness and weathers back together. The texture paints both, packages as the broad
light-and-dark banding and beds as the laminations inside them. The mesh takes the packages alone,
and only where a package is over two mesh quads wide, so a fine stack fades out of the geometry
rather than aliasing on the silhouette. Same rule as `crackCoarse` against `crackFine`, applied
continuously.

It is additive by construction: a bed shifts the tone *before* the palette ramp, so the bands are
the stone's own colours and every layer below composites over a banded base. `laminaeAccentShare`
lets a share of beds leave the ramp for one accent colour, which is the pale seam or the iron-red
band a ramp cannot reach. It stacks with `plates` rather than replacing them, off the same bedding
frame: plates give the cleaved blocks, laminae the continuous sheets, and a bedded sandstone wants
both.

`laminaeRelief` is the differential weathering, and it is most of what makes a bedded face read. A
face's beds are ribbed, not painted.

**Weathering.** Each is a mask:

| Mask           | From                                                             | Writes                                  |
| -------------- | ---------------------------------------------------------------- | --------------------------------------- |
| Exposure       | `dot(n, up)`, and a colony noise                                 | Lichen discs on tops                    |
| Patina         | Moisture: up, hollows, crack seep, drip lines, colonies; not edges | Dark crust, brown margin, glossier heart |
| Stain          | Crack proximity, and patches banded along the bedding            | Iron tint                               |
| Veins          | Zero crossings of a stretched noise                              | Light, glassy, raised lines             |
| Edge wear      | Curvature of `shape` at four reaches, summed and feathered        | Convex edges bleached, smoother, clear of stain and growth |
| Run-off        | Droplet trails on a cylinder about up, on steep faces, fading down | Tint, roughness, occlusion; no height   |
| Wash           | `dot(n, up)`, drifted                                            | One multiply on the base stone, under every mark |
| Snow           | `dot(n, up)`, less on edges, more in hollows, drifted           | Mottled white, blue in shadow, last     |
| Cavity dirt    | Low local height                                                 | Dirt colour, rough                      |
| Drip stains    | March a short way up `+up` sampling the crack field              | Darkening below a crack                 |
| Ground contact | Height above the lowest point                                    | Soil and moss tint                      |

The rest is the existing pipeline: float linear compositing, the normal derived from the height by
`encodeNormal`, the ARM assembled, the curvature pass. Rock normals are the whole look, which is
why the 16-bit height argument in [scatter-forge.md](./scatter-forge.md) matters most here.

### A pebble runs the whole painter

A pebble takes every key a rock takes, and every one of them works. That follows from the clusters
below giving each pebble its own bake: nothing in the painter has to be held back, because every
mark lands on the stone whose surface it was read off.

The defaults are still grain and colour. `cracks`, `plates` and the weathering keys are 0 for a
pebble, so a config that sets none gets tone, mineral grain, grit and glint, which is what a stone
at this size shows. A config that wants lichen on its cobbles sets `weathering` and gets it.

`snow` is what this bought. It reads `dot(n, up)`, the hollows and the edges, so a shared skin could
never have carried it: the white would have landed on the underside of most of the cluster.

## Pebble clusters

A cluster is several pebbles in one mesh, the way a patch is several tufts. A packing loop places
them largest first on the ground plane, each new one offered a place at the foot of one already
down, so the small ones nestle against the large and none overlaps. Each pebble is its own seed of
the cube-sphere generator, and each beds into the ground by its own share of its own height.

**Each pebble takes its own block of the image.** An earlier draft had them share an atlas of a few
grain bakes, the way a leaf card picks a cell, and stopped the painter after the grain because a
shared skin has no up: lichen reads off `dot(n, up)`, soil climbs from `field.base`, and edge wear
reads the curvature of `shape`. A skin baked from one stone and worn by another lands all of it on
the wrong faces.

The sharing was never needed. A chart is sized off `textureSize`, and a pebble's may be small:

| Layout                       | Image   | Texels baked | Skin matches the stone |
| ---------------------------- | ------- | ------------ | ---------------------- |
| 14 blocks at a 64px chart    | 768×512 | 0.34M        | Yes                    |
| 4 shared blocks, 128px chart | 768×512 | 0.39M        | No                     |
| One rock, 512px chart        | 1536×1024 | 1.57M      | Yes                    |

A block per pebble is **cheaper** than four shared ones and a fifth of a single rock's bake, so the
cluster pays nothing for the thing that makes the painter whole. The image grows with
`pebblesPerModel`, which is the one cost: a texture set can only be shared between variants that
hold the same number of stones.

No pebble is turned or tilted after it is built, for the same reason the skins are not shared. Its
seed already gives it its own scoops, bedding and noise, and a rotation applied after the bake would
take the weathering's up with it.

Rocks and outcrops do not cluster. A rock's bake is its own, and its hull is one shape.

## Colliders

**Pebbles have none.** A stone that stops the player is worse than one they step over, which is the
clump's reason. Written.

**A rock is one convex hull.** Written. `PhysicsShape` carries `{ type: 'hull', points: number[] }`. The forge
decimates the rock to at most 32 points and writes them into the layer entry beside where a tree's
capsule goes. The hull of a scooped sphere is a close fit: the ridges between scoops are where it
touches, and the faces sag inside it by the scoop depth. Engine side, `shapeDesc` in
[`ColliderShapes.ts`](../src/core/physics/ColliderShapes.ts) scales the points into a scratch
`Float32Array` held per shape and calls `ColliderDesc.convexHull`.

**An outcrop is one hull per slab.** A layer's `collider` accepts a list, and the streamer holds one
collider per shape per instance, counting shapes against its budget.

**Walking on top already works.** `Player.computeColliderMovement` is called with no filter
arguments, so it collides against every collider the world holds, scatter included, and
`computedGrounded` is derived from that same cast. A rock's hull is walkable today.

The `TERRAIN_GROUPS` ray in the same file is not the ground probe. It runs once at spawn to answer
whether terrain has streamed in yet, which is when gravity is allowed to turn on, and it filters
scatter out on purpose so a boulder cannot stand in for the ground that has not loaded.

## Outcrops

An outcrop is not star-shaped — a ray from its centre leaves the body under an overhang and
re-enters it above, so `shape(d)` has no single value — and not one bake, so it is not a rock. It is
a **stack of convex
slabs**: each a cleaved box with its own extents and a lateral offset from the noise, so an upper
slab protruding past a lower one is the overhang. Thin wide slabs read as strata; tall square ones
as jointed granite. Building it as a union of convex parts is what makes the rest fall out:

- **The hulls are the parts.** Each slab's undisplaced cleaved box is its hull. Nothing is
  decomposed. The render surface differs from the hull by the noise amplitude, so the amplitude
  stays low on top faces, which is how walked-on rock looks anyway.
- **Far and near are the same object.** The far LOD is the slabs undisplaced under the tiled stone
  set. The near LOD adds subdivision, displacement and grooves along slab edges. This is the
  existing `lods` chain.
- **The cracks are geometry.** At ten to thirty metres a unique bake is fifty texels a metre, so the
  texture tiles under a world-scale cube projection and the cleave edges, strata gaps and chipped
  corners are what read as cracks.
- **The laminae tie the slabs together.** A stack of convex parts reads as a pile of boxes unless
  something runs through all of them at one orientation. Bedding is that, and it is the one
  component that survives a tiled texture: it depends only on height in the bedding frame, so it
  stays continuous across a tile boundary where nothing lateral could. The slab stack and the beds
  take the same frame, so the cleave planes and the bedding agree.

Cracks by scale:

| Scale   | Cracks are                                     |
| ------- | ---------------------------------------------- |
| Pebble  | Off by default, and the rock's own field when asked |
| Rock    | Texture and mesh grooves from the same field   |
| Outcrop | Geometry, over a tiled texture                 |

## Emitted layers

A rock's entry is `granite_boulder`'s with the hull in place of the box: `alignToNormal: 1`, a
negative `yOffset`, an impostor, a LOD chain.

A pebble's takes what the old hand-authored `granite_pebble` decided and nothing else: no collider,
no impostor, no shadow. It differs in one number. A cluster is to a pebble what a patch
is to a tuft, so one candidate is resolved for a dozen stones, and the footprint is several times
the cluster's own span rather than just clear of it. Clusters laid edge to edge read as a paved
path, and a cluster spaced at a single stone's footprint puts thirty times the gravel on the ground
the layer it replaces did. The floor is the 2.5m `granite_pebble` shipped at.

An outcrop's is a rock's with a list of hulls, a long cull distance and no jitter on scale, because
its hulls were measured at one size.

## What the outcrop is actually for

The problem it was reached for is this: *the mountains are smooth. No spires, no crags, no
overhangs. Adding rocks does not fix it, because they do not read at distance, and close up it is
still rocks scattered on smooth ground.*

**An outcrop scatter layer does not solve that, and would partly make it worse.** Three separate
problems are bundled in it, and only one of them is a scatter problem.

### The silhouette is the terrain's, and the terrain is smooth by construction

`MOUNTAIN` deforms with one fbm at persistence 0.35 over six octaves. That is the smoothest setting
in the family: after the second octave there is nothing left.

| octave | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| persistence 0.35 (now) | 100% | 35% | 12% | **4%** | **1.5%** | **0.5%** |
| persistence 0.5 | 100% | 50% | 25% | 12% | 6% | 3% |

Four of the six octaves do nothing. The massif is a one and a half octave shape, and fbm is rounded
by nature whatever its settings: it makes rolling hills, never a ridgeline and never a crag.

**This is the biggest lever and it is not in this tool.** `Noise.ts` evaluates deformations through a
plain switch on `kind`, with the comment that it *stays cheap however many kinds exist*. It is built
to be extended, and it has two kinds today. Three worth adding, in order of payoff over effort:

- **`ridged`** — `1 - |noise|` per octave instead of the raw value. Sharp ridgelines and V-shaped
  valleys in place of rounded blobs. This is the single change that makes a mountain read as a
  mountain, and it is a handful of lines beside the existing fbm case.
- **`terrace`** — quantise the height into steps. Mesas, benched cliffs, strata. It is cheap, it is
  dramatic, and it is the change that makes the laminated sandstone read as *part of* the landscape
  rather than as props standing on it.
- **`spires`** — sharp positive features placed on a lattice. Still a heightfield, so still no
  overhang, but genuine crags in the silhouette at every distance, which is most of the complaint.

`marble_cliff_05` is already keyed to slope 15..75 and is barely showing, because there is little
steep ground for it to show on. Steepening the terrain pays out in material that is already authored.

### A heightfield cannot overhang, so that part does need meshes

One height per XZ, by definition. Overhangs, undercuts and caves can only come from geometry laid on
top, which is what the outcrop is for. That part of the plan survives, but it is the *smaller* part
of the problem, and it should follow the terrain work rather than substitute for it.

### Scale, not count

A 2 to 4 metre rock is invisible at the distance a mountain is looked at. Raising `cullDistance`
does not help, because the rock is under a pixel long before it is culled. Anything meant to read
against the skyline has to be tens of metres, which means either the terrain or a handful of very
large outcrops placed as landmarks.

### Will they all look the same?

Scattered at density, **yes**. A ten metre formation repeated across a hillside is clocked in
seconds, and no amount of scale jitter hides it: jitter on something that large reads as a cloned
object at two sizes. So an outcrop wants to be **large and sparse**, placed as a landmark, and
placed to *agree* with the terrain — on a ridgeline, at a break of slope — rather than sprinkled by
a density number. That is placement logic, not a density tweak.

What stops them being one shape is that the tool has **two** shape fields, and they make different
rock:

| Driven by | Gives | Geology |
| --- | --- | --- |
| **Bedding** (`laminae` hardness sets each bed's lateral reach) | Mesas, hoodoos, undercut cliffs, layered overhangs | Sedimentary |
| **Joints** (the `plates` slab pile) | Tors, blocky spires, stacked angular blocks | Granite |

The complaint names *spires*, and spires are joint-driven, not bedding-driven. So an outcrop wants
both fields available with a key deciding which dominates. That, rather than a variant count, is
what keeps them from reading as one shape repeated.

## Outcrops: the four open questions

Answers to the questions that have to be settled before any of the above is written. The numbers
here are measured against the tool as it stands, not estimated.

### What the shape is, and what controls it

**Build it as an isosurface over a signed distance field, not as a hand-stacked pile of boxes.**

The three fields it needs already exist and already compose: `platesInto` in `plates.ts` is a pile of
bevelled slabs aligned to a bedding frame, `laminaInto` in `laminae.ts` is the bedding stack, and
`noise.ts` has the 3D bases. An outcrop's SDF is the smooth union of the slab boxes, displaced by
the relief and the laminae. Meshing that with surface nets gives real overhangs and one watertight
solid, and the slabs' own undisplaced boxes stay the colliders, so *the hulls are the parts* still
holds.

What normally blocks an isosurface is UVs: there is no natural parameterisation. The texture answer
below removes that blocker, which is why these two questions have to be settled together.

**The profile should come from the bedding, not from a separate `overhang` key.** Differential
weathering is literally what cuts an overhang in bedded rock: a hard bed sits over a soft one, the
soft one retreats, and the hard one is left oversailing it. That is a mushroom rock, a hoodoo, an
undercut cliff. It is the same mechanism that ribs a rock's face in `laminaeRelief`, turned up until
it undercuts.

So the SDF's lateral radius at a height is set by that bed's own `hardness` from `laminaInto`:

```
              +--------------------+
              |   hard cap bed     |   <- stands proud
          +---+---+            +---+---+
          |       |            |       |   <- soft bed, weathered back
          |       +------------+       |      = overhang, both sides
      +---+--------------------------+---+
      |           hard bed               |
      +--+----------------------------+--+
         |        soft bed            |      <- undercut
    +----+----------------------------+----+
    |              hard bed                 |
----+---------------------------------------+---- ground
```

What this buys over a separate key: the bands you *see* and the shape you walk on come from one
field, so they agree by construction. It reuses `laminaeSize`, `laminaeVary` and `laminaeWarp`
rather than inventing a parallel set. And `laminaeRelief` becomes one continuous control from a
ribbed face through a benched cliff to a full undercut.

Keys, then: `laminaeUndercut` (how far a soft bed retreats, as a multiple of `laminaeRelief`,
where an outcrop is simply a rock with this turned up), plus the joint-driven half — `slabs`,
`slabHeight`, `slabLean`, `cleave` — and **`jointing`**, the balance between the two shape families
in the table above. 0 is a layered mesa, 1 a blocky tor. Everything else comes from the keys the
rock already has, and the isosurface cell size is the LOD lever.

*Risk*: surface nets is the largest new machinery the tool would take on. The fallback, if it has to
be descoped, is the explicit box stack described above: far less code, blockier results, and visible
interpenetration where two slabs meet.

### Texture size, and why a unique bake is not on

A rock's image is 1536x1024 over about 25m² of surface, which is **251 texels a metre**. An outcrop
of eight metres by five by six has roughly 150m² of visible surface. Holding the same density over
it needs **9.5M texels, a 4096x2560 map per variant**. That is not viable, and it gets worse with
every variant.

So the detail tiles, and nothing about it is per-outcrop:

- **Detail: one shared tiling stone set, sampled triplanar by world position.** Three taps weighted
  by `|n|`. It holds about 500 texels a metre whatever the outcrop's size, it is one set shared by
  every outcrop, and it needs no UVs at all — which is what lets the mesh be an isosurface.
- **Macro — the per-outcrop staining, exposure and occlusion — needs no texture either.** Bake it
  into vertex colours. `COLOR_0` carries the wind weights for foliage, and an outcrop has no wind,
  so the channel is free. A surface-nets mesh at 0.15m cells carries on the order of ten thousand
  vertices, which is ample for terms this low in frequency.

That is **zero unique texture memory per outcrop**, which is the answer to the worry that a walkable
rock needs a huge map. The cost is three taps per map, nine across diffuse, normal and ARM. Fine for
a handful of large objects, and not something to do to grass.

**The laminae are the one thing worth a shader for.** They are a function of height in the bedding
frame and nothing else, so they can be evaluated per fragment from world position with no texture
behind them. That gives unlimited band resolution exactly where a player is standing on the rock.

### Placement

**Yes, and it is the pebble cluster's problem three times over.** A cluster is posed off one height
and one slope sample and starts failing past 4m; terrain samples are 2m apart, so an eight metre
outcrop spans four of them and its far end can sit metres off the ground.

Two changes to the placer:

1. **Reject a candidate where the terrain height range under the footprint is too great.** Outcrops
   then appear only where the ground can hold them, which is also what real ones do: they emerge
   from bedrock rather than perching on a slope.
2. **Sink to the lowest of several samples under the footprint**, not to the centre one. Buried is
   recoverable, floating is not.

`alignToNormal` wants to be 0 or near it. A rock this size tilting to the local slope reads as
toppling, not as bedded.

`SCATTER_COLLIDER_BUDGET` is 512 and the streamer holds one collider per shape per instance, so an
outcrop of six slabs spends six of it. That caps how many can be resident at once.

**No engine change is needed to stand on one.** The character controller already collides against
scatter colliders unfiltered, so an outcrop's hulls are walkable the moment they exist. What does
want checking is the budget above, and how far the hull sits from the render surface: a player walks
the *hull*, so the rule that the noise amplitude stays low on top faces is what keeps the two within
a step of each other.

### Blending into the terrain

Two separate features, worth keeping apart.

**Blending the base**, in rising cost:

- **Vertex-baked ground contact.** The rock painter already does this in texture space, where soil
  climbs the lowest part of the stone. The same weight in a vertex channel, blending toward a soil
  tint, costs nothing and needs no engine work. It is most of the perceived benefit, because the
  seam at a rock's foot is hidden by dirt and debris in the first place.
- **The terrain's composited albedo, readable by scatter draws and sampled by world XZ.** Genuinely
  better, and it serves trunk bases and clumps as much as outcrops. It is a real system: a per-chunk
  albedo target, bound to the scatter draws, behind a per-layer material flag. Every layer but the
  pebbles would want it.

**Early-Z and the alpha test** is a different mechanism and does not follow from the above. There is
no depth prepass today. For opaque scatter it is easy and helps at once. For alpha-tested foliage,
which is the actual pain — see *overdraw at ground level, where the alpha test defeats early-Z* in
the README — the fix is a depth-only prepass running the same alpha test, doubling the vertex work
to halve the shading. That is usually a win at high overdraw, and it wants measuring rather than
assuming.

**Leave both out of the outcrop work.** Bake the ground-contact weight into a vertex channel now,
and the better version later becomes a shader change reading a weight the meshes already carry,
rather than a re-bake of every asset.

### Suggested order

Terrain first, because it is the cheapest change with the largest effect and it fixes the distance
problem that no scatter layer can:

1. **`ridged` as a deformation kind**, and `MOUNTAIN` retuned off persistence 0.35. Small, and it is
   the change that makes the massif read as a mountain at every distance.
2. **`terrace`**, for benched cliffs and mesas. This is what makes the bedded rocks belong.
3. The outcrop mesh: SDF, surface nets, slab hulls, triplanar detail. No macro, no blending. The
   hulls are walkable as soon as they exist, so this stands up on its own.
4. Vertex-baked macro: exposure, staining, occlusion, ground contact.
5. The outcrop's own material mode: triplanar sampling, then laminae and snow per fragment.
6. Terrain albedo blending and the depth prepass, as their own piece of work.

Steps 1 and 2 are in `Noise.ts` and `Biomes.ts`, not in this tool. They are worth doing before any
of the rest, because an outcrop standing on smooth ground still looks like a prop on smooth ground.

## Engine work

Everything above is forge work except the outcrop's two items. A rock's hull shipped with the rock,
and a pebble needed nothing: it has no collider, so the only engine change it carries is the six
biome entries that used to name `granite_pebble` and now name the layer that replaced it.

- A layer's `collider` may be a list, for an outcrop's slabs.
- A material mode that samples a tiling set triplanar, which is what an outcrop is textured by.

Standing on one needs nothing: the character controller already collides against scatter unfiltered. Later, an outcrop would benefit from a unique macro map (exposure, stains) multiplied
over the tiled detail, which is one material feature in `scatter-instanced.wgsl`.
