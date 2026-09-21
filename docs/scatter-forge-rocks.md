# scatter-forge — rocks

Design for the stone types in [scatter-forge](../tools/scatter-forge/README.md): a pebble, a rock and
an outcrop. `rock` is written and documented under the README's [Rocks](../tools/scatter-forge/README.md#rocks);
`pebble` and `outcrop` are not. The README's [Tuning a rock](../tools/scatter-forge/README.md#tuning-a-rock)
explains each key with examples. Fold what remains into the README as it lands.

## Three types

Following the tool's rule that a type earns itself at the mesh and the texture painter:

| `type`    | Mesh                                   | Texture                                | Collider          | Clusters |
| --------- | -------------------------------------- | -------------------------------------- | ----------------- | -------- |
| `pebble`  | Scooped sphere, shallow, light noise   | Grain and colour only, shared atlas    | None              | Yes      |
| `rock`    | Scooped sphere, field grooves          | Unique bake: grain, cracks, weathering | One convex hull   | No       |
| `outcrop` | A stack of convex slabs                | Tiled stone; the cracks are geometry   | One hull per slab | No       |

`pebble` and `rock` share the mesh generator and differ at the painter and in what the layer emits.
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

Six charts in a 3×2 atlas. One piece: `{ key: 'stone', cutout: false, height: true, material: true }`.

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

### Pebbles are grain only

A pebble's painter stops after the grain: noise and colour, a derived normal, no cracks and no
weathering. Pebbles are small, share their skins, and a crack at that scale is a texel.

## Pebble clusters

A cluster is several pebbles in one mesh, the way a patch is several tufts. A packing loop places
them largest first on the ground plane with the smaller ones nestled at the base of the larger,
none overlapping. Each pebble is its own seed of the cube-sphere generator.

Skins come from an atlas of a few grain bakes, and each pebble in the cluster picks one, the way a
leaf card picks a cell. A skin's texture does not match that pebble's bumps, which is only
acceptable because a pebble's texture carries no features that could disagree with its shape.

Rocks and outcrops do not cluster. A rock's bake is its own, and its hull is one shape.

## Colliders

**Pebbles have none.** A stone that stops the player is worse than one they step over, which is the
clump's reason.

**A rock is one convex hull.** `PhysicsShape` gains `{ type: 'hull', points: number[] }`. The forge
decimates the rock to at most 32 points and writes them into the layer entry beside where a tree's
capsule goes. The hull of a scooped sphere is a close fit: the ridges between scoops are where it
touches, and the faces sag inside it by the scoop depth. Engine side, `shapeDesc` in
[`ColliderShapes.ts`](../src/core/physics/ColliderShapes.ts) scales the points into a scratch
`Float32Array` held per shape and calls `ColliderDesc.convexHull`.

**An outcrop is one hull per slab.** A layer's `collider` accepts a list, and the streamer holds one
collider per shape per instance, counting shapes against its budget.

**Walking on top.** The terrain-only ground ray passes through the scatter group; the character
controller walks into scatter colliders but nothing yet stands on one. The ground probe needs the
scatter bit before a rock or outcrop is walkable.

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

Cracks by scale:

| Scale   | Cracks are                                     |
| ------- | ---------------------------------------------- |
| Pebble  | Not drawn                                      |
| Rock    | Texture and mesh grooves from the same field   |
| Outcrop | Geometry, over a tiled texture                 |

## Emitted layers

A rock's entry is `granite_boulder`'s with the hull in place of the box: `alignToNormal: 1`, a
negative `yOffset`, an impostor, a LOD chain. A pebble's is `granite_pebble`'s: no collider, no
impostor, a short cull distance. An outcrop's is a rock's with a list of hulls, a long cull distance
and no jitter on scale, because its hulls were measured at one size.

## Engine work

Everything above is forge work except:

- `PhysicsShape` gains `hull`, and a layer's `collider` may be a list.
- The ground probe includes the scatter collider group.

No shader work. Later, an outcrop would benefit from a unique macro map (exposure, stains) multiplied
over the tiled detail, which is one material feature in `scatter-instanced.wgsl`.
