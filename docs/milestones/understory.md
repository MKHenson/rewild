![Understory](../images/understory.png)

# Objects, Scatter & Foliage (Understory)

Rewild's world is not only bare ground. Trees, grass, ferns, palms, rocks and pebbles grow on it,
and the objects you place stay on the ground when you reshape it. This page explains what that
system does and how to use it from the editor.

> **Where the name comes from.** _Understory_ was the milestone that built this system. The
> understory is the living layer between the bare ground and the tree tops. That work is complete.
> This page is now the plain-English guide to what it gives you.

---

## The short version

- **Models come in from Blender and other tools** as glTF files, with their parts, materials and
  textures.
- **Objects stay on the ground.** Sculpt the terrain and everything on it moves up or down with it.
- **Each biome grows its own plants and stones.** A forest grows oaks and ferns. A desert grows
  palms and sandstone. You do not place them one by one.
- **You can paint more, remove some, or clear an area** with the scatter brush in the editor.
- **Forests reach the horizon.** Far trees draw as simpler models, then as flat pictures.
- **Plants move in the wind**, and the wind follows the weather.
- **The player collides with trunks and rocks** near them, at a fixed cost.
- **[scatter-forge](../scatter-forge/README.md) makes the models.** One small config file gives
  a full, ready-to-place plant or stone.

---

## Models

The engine reads glTF models (`.glb` files). It keeps what the artist made:

- A model with many parts keeps each part in its correct position.
- A model with many materials keeps each material. For example, a tree keeps solid bark and
  cut-out leaves.
- The engine makes a material from each material in the file, and loads its textures. Two models
  with the same material share it.

glTF has no way to say "this part is a leaf". So a plant made by hand needs two more steps:

1. **In the file**, set the leaf material to alpha clip (glTF `MASK`) and double-sided. Use clip,
   not blend. Clipped leaves sort correctly against each other.
2. **In its scatter layer**, set `foliage: true`. This lights the cut-out parts as leaves: no
   shine, and light comes through from behind. It does not change the bark.

Do not set `materialId` on a plant. It replaces every material in the model with one material, so
the bark and the leaves draw the same.

[scatter-forge](../scatter-forge/README.md) does all of this for you. Its models also share one set
of textures across a family, such as `oak-01` to `oak-03`. See
[Share textures across a family](../scatter-forge/README.md#share-textures-across-a-family).

Animated characters are a different, later piece of work.

---

## Objects that stay on the ground

When you drop an object in the editor, it lands on the surface under the pointer. That surface can
be the terrain or another object, such as a crate on a platform.

The engine does not store the height of the object. It stores the height **above the ground**. So
if you raise, lower or smooth the ground later, the object moves with it. It does not float or sink.
The same is true when you load a saved world or change a climate preset.

- **An object dropped on the terrain** tilts to match the slope a little or fully. Boulders and
  fallen logs lie on the slope. Trees and fence posts stay upright.
- **An object dropped on another object** stays level with that object. Both follow the ground
  together.
- **An object dropped where the ground has not loaded yet** keeps its exact position.

You can still move any object by hand in the Properties panel.

---

## Scatter: plants and stones that grow by biome

Each biome has a list of plants and stones that grow there. Each entry says how dense they are and
where they grow. For example, "oaks, fairly dense, only on flat ground". The rules can use:

- **Slope**: trees on flat ground, scree on steep faces.
- **Height**: spruce and heather high on the mountain.
- **Noise**: natural patches and gaps, so a forest has clearings.

These conditions are AND'ed togther.

The shipped biomes use these to grow, for example:

| Biome           | What grows there                                             |
| --------------- | ------------------------------------------------------------ |
| Plain           | Grass, wildflowers, thistles, pebbles and a few boulders     |
| Forest          | Oak, poplar, cypress, ferns and grass                        |
| Mountain        | Spruce, cypress, heather, granite boulders, scree and snow   |
| Desert mountain | Sandstone rocks and cobbles                                  |
| Desert          | Palms, dry grass and sandstone                               |

The same world seed always grows the same plants in the same places. Plants that you do not edit
cost nothing to save, because the engine grows them again each time.

**How to use it.** To add a plant to a biome, add one line to that biome's `scatter` list in
`Biomes.ts`. See [In the game](../scatter-forge/in-game.md#add-a-model-to-the-world).

---

## The scatter brush in the Editor

The biome rules make the natural world. The scatter brush is for what you want **in one place**. For
example, a pine grove in a desert, a clear area for a camp, or one tree removed from a path.

Open it with the **trees** button in the editor ribbon, next to the sculpt and biome paint buttons.
A small panel shows over the viewport.

| Control      | What it does                                                                     |
| ------------ | -------------------------------------------------------------------------------- |
| **Layer**    | The plant or stone to paint. The list holds every model, not only the biome's.   |
| **Paint**    | Drag to add more of the layer. Hold **Shift** to remove it.                      |
| **Erase**    | Drag to remove the layer that you painted.                                       |
| **Exclude**  | Drag to clear everything that the biome grows. Use it for paths and clearings.   |
| **Pluck**    | Click a single plant or stone to remove it. **Shift**-click puts it back.        |
| **Radius**   | The size of the brush, in metres.                                                |
| **Strength** | How much each stroke adds or removes.                                            |

Hold **Alt** and drag, or drag with the right mouse button, to move the camera. Press **Esc** to
close the brush.

Painted plants behave the same as biome plants. They follow the ground when you sculpt, they use
the same detail levels, and they move in the wind.

---

## Far away: detail levels and impostors

Near the camera, each plant draws as its full model. As it gets farther away, the engine changes
to simpler versions of the model. Farther still, it draws a flat picture of the model, taken from
the correct side. This picture is an **impostor**. Past a set distance, the plant does not draw.

Each change fades in, so you do not see plants "pop". This lets a forest go to the horizon on a
normal computer in a web browser.

Grass and small stones do not need this. They stop drawing at a short distance.

---

## Wind

Trees, grass, palms and ferns move in the wind. Trunks bend a little, branches move more, and the
leaves flutter. Neighbouring trees move together, as a gust passes over them.

The wind comes from the [weather system](../weather.md). A calm day gives a slow, small sway. A
storm moves the trees strongly in the direction of the wind. You do not need to set anything.

Shadows move with the plants.

---

## Physics

In the game, the player collides with tree trunks, palm stems and rocks. Grass, pebbles, ferns and
low bushes such as heather do not stop the player.

A forest can have millions of trees, so only plants near the player get a collider. As the player
moves, plants ahead get one and plants behind lose it. There is a fixed limit on how many are
active, so the cost stays the same in a dense forest.

---

## Saving & sync

Scatter edits save in the same way as [terrain edits](./strata.md#saving--sync):

- Plants that the biome grows are never saved. The engine grows them again from the seed.
- Painted and cleared areas save as a small file for each chunk that you edited.
- Plucked plants save as a short list for each chunk.
- Edits save to the browser first, and sync to the cloud when you log in.

---

## Make new plants and stones: scatter-forge

[scatter-forge](../scatter-forge/README.md) is the tool that makes the models the scatter system
places. It was not in the first plan, but it now makes all the plants and stones in the game.

You give it one small config file. It grows a model from it: a tree, a grass patch, a palm or fern,
a rock, or a group of pebbles. It also writes the textures, the simpler far-away versions, the
impostor pictures and the wind data. The same config and seed always make the same model.

To add a new plant to the world:

1. Copy a template that is near to what you want, and give it a new name.
2. Run the tool with `--watch` and a preview. Change the config until the preview looks correct.
3. Run it once with `--write-template` to register the model.
4. Add a rule to a biome in `Biomes.ts`, or paint it with the scatter brush.

The [scatter-forge guide](../scatter-forge/README.md) explains each step and each type of model.

---

## Debugger / console functions

Console commands show which plants draw and at which detail level, turn one layer off, force the
wind, and show the physics limit. See
[Debugger & Console Commands](../debug-commands.md#scatter).

---

## Related docs

- [Terrain (Strata)](./strata.md): the ground and biomes that scatter grows on.
- [Materials & Shading (Lichen)](./lichen.md): how the plants and stones are lit.
- [Weather System](../weather.md): the wind that moves the plants.
- [scatter-forge](../scatter-forge/README.md): the tool that makes the models.
