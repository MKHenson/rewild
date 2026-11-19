# Shoal

Working doc. It is for planning this work, not a milestone write up. When the work ships, rewrite it as a guide, the same as Sinew.

## Goal

The seas and lakes come alive. A player wades into the shallows and guppies dart away from their feet. Further out, a school of sardines streams past, and tuna cruise below it. Crabs walk the bed of the sea and the lake. Jellyfish drift, and sting if you touch them. A shark circles, and may come for you. A pod of orcas breaks the surface off the coast, rests, and comes over to look at you.

The player can fight back and fish. They carry a spear, and what they catch goes in a basic inventory. Creatures get hurt and die. A fish on land flops and dies. A school that is hunted gets smaller.

Shoal is the next step from Sinew. Sinew gave creatures a body, clip animation, simple movement and habitats. Shoal adds, for water creatures:

- **Where they live**: ocean zones by depth and distance from shore, used by biome rules for creatures and for plants such as kelp and coral.
- **How they swim**: procedural swim motion, so no fish needs a swim clip.
- **How they move together**: schools at counts far past Sinew's 100.
- **Life and death**: health, damage and death, for creatures and the player.
- **The first player tool**: a spear, and an inventory to hold what it catches.

Land and air get the same deeper dive in later docs. Shoal builds the shared parts (3D movement, group steering, health, threats, the inventory) so those docs reuse them.

---

## Stages

Shoal is too much for one drop. It ships in four stages. Each stage is playable on its own.

| Stage                | What it gives                                                                                      | Creatures                     |
| -------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------- |
| **1. Place and swim** | 3D movement, shore distance, zone rules, the swim driver, school fish, simple schools, bed walking | Tuna, sardine, trout, guppy, crab, jellyfish |
| **2. Life and death** | Health, damage and death. Fish die on land. Jellyfish and sharks hurt the player. Sharks hunt     | Shark                         |
| **3. Spear and catch** | A basic inventory and a spear. Fish can be caught, sharks fought                                  | -                             |
| **4. Orcas and the deep** | Pods, curiosity, surface actions, leaping, sleeping. Richer school shapes. A deep zone      | Orca, anglerfish              |

Schools in Stage 1 only cruise and get out of the way. Bait balls, fountains and flashes wait for Stage 4, and may come out of tuning rather than new code.

---

## Creatures

These test assets shape the work. Mat makes them in Blender.

| Creature      | Role                                      | Habitat                       | Drawn with           | Stage |
| ------------- | ----------------------------------------- | ----------------------------- | -------------------- | ----- |
| **Tuna**      | Large fish in small schools               | Open ocean                    | Bones, swim driver   | 1     |
| **Sardine**   | Small fish in big schools                 | Ocean, reef to open water     | Shader swim, no bones | 1    |
| **Trout**     | Lake fish, alone or in twos and threes    | Lakes and tarns               | Bones, swim driver   | 1     |
| **Guppy**     | Small lone fish, darts away from the player | Shallows of sea and lakes   | Shader swim, no bones | 1    |
| **Crab**      | Walks the bed, sea and lake               | Bed                           | Bones, clips         | 1     |
| **Jellyfish** | Drifts and pulses. Stings on contact      | Ocean, any depth              | Small rig, a pulse clip | 1  |
| **Shark**     | Large lone predator. Can attack the player | Reef and open water          | Bones, swim driver   | 2     |
| **Orca**      | Top predator in a pod. Curious. Leaps, spy hops, tail slaps, sleeps | Open ocean, surface | Bones, swim driver, clips, look-at | 4 |
| **Anglerfish** | Slow deep fish with a glowing lure       | The deep                      | Bones, swim driver   | 4     |

**Jellyfish.** A template with a preset needs a skinned model, so a jellyfish has a small rig: a few bones down the bell and tentacles, with a `pulse` clip. The clip driver plays it with no new code. If jellyfish blooms need hundreds, the bell pulse moves to the shader like the school fish.

**Anglerfish.** It hangs still in the dark with its lure glowing, and moves in short slow bursts. See The deep.

**Trout and tuna.** Same driver, different presets and habitats. Tuna keep moving, as a group. Trout are loners: each one picks a spot, hovers there with small fin and tail corrections, then moves on. A new mode, Hold, does this. Wander's wait can become Hold for any fish.

**Guppies.** Lone fish, not a school. Each is an ordinary creature with Wander and Evade, a fast turn rate and quick bursts, so it darts away from the player and settles a few metres off. They use the shader swim, so they have no CPU pose, but they count toward Sinew's 100. **Sardines** are the school.

---

## What Sinew gives us

| Part          | Today                                                                                 | Gap for the sea                                                            |
| ------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Water habitat | Between the bed and the surface by a margin. Optional water types                     | No depth band, no distance from shore, no bed or surface habitat           |
| Movement      | Heading about Y, plus a height that eases toward a target. Roll for birds             | No pitch. A fish climbs without tilting its body                           |
| Modes         | Wander, Evade, Seek. Player distance is measured flat in X and Z                      | A fish 20 m below a swimmer reacts as if it were next to them              |
| Groups        | A group shares a drifting `HerdHome`. Each animal wanders round it on its own         | No schooling. Fish in a group do not align, keep spacing or turn together  |
| Swimming      | Tuna plays a swim clip through the clip driver                                        | No procedural swim. Every fish needs bones and clips                       |
| Spawning      | Per biome, groups per hectare. `TUNA` is in every biome's rule list. 120 m spawn      | Rules cannot target depth or shore. Under water you see far less than 120 m |
| Stranding     | A fish on land plays `idle` and stays still                                           | It should flop and die                                                     |
| Health        | The player has health. Creatures have none                                            | Nothing can hurt a creature, and no creature can hurt the player          |
| Budget        | 100 creatures, each with a full CPU pose                                              | A school of 200 sardines does not fit                                      |

---

## Decisions

| Topic            | Decision                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope            | Water creatures, their health and death, and the first player tool. Land animals that swim and birds that dive are not Shoal                                                              |
| Stages           | Four stages, each playable on its own. See Stages                                                                                                                                         |
| Shore distance   | Built in Rust in the terrain worker, with the water map. See Shore distance                                                                                                               |
| Zones            | No zone map. Rules select on depth and shore distance with `{ from, to }` selectors. Shallows, shelf, open water and deep are names for common ranges                                     |
| Sea biomes       | Under water has its own biomes, picked by temperature and zone. They own the bed surface, scatter and creatures under the water. See Sea biomes                            |
| New habitats     | `bed` in Stage 1 for crabs. `surface` in Stage 4 for orcas                                                                                                                               |
| 3D movement      | Water creatures get pitch, limited per preset. Player distance in modes is 3D for water creatures                                                                                       |
| Swim driver      | A `swim` driver next to `clips`. Clips stay optional, for actions such as a bite or a tail slap                                                                                          |
| School fish      | Drawn with a shader wave and no skeleton. Spine and fin weights are painted in Blender as vertex colours                                                                                  |
| Schools          | One object with members in flat arrays, not creatures. Own budget, apart from Sinew's 100. Starting number: 1,000 members                                                                |
| Health           | One health model for creatures and the player. Damage has a source, so a creature knows who hurt it                                                                                      |
| Death            | No death clip. A dead creature rolls belly up, its body goes limp and it sinks or floats. It despawns after a time or when far away. See Death                                          |
| Out of the water | Each preset says what a stranded creature does: flail, hold a pose, or play a clip. See Out of the water                                                                                 |
| Attacks          | An attack plays an action clip, such as `bite`. Damage lands at a set time into the clip                                                                                                  |
| Shadows          | Water creatures cast no shadows. Caustics carry the light under water                                                                                                                     |
| Schools go down  | A hunted or speared school loses members. It refills slowly while the player is away                                                                                                      |
| Inventory        | Very basic: a few slots of item and count, a hotbar, pick up and select. No crafting, no trade, no drag and drop in Stage 3. The data is apart from how it is drawn. See Inventory         |
| Spear            | A thrust first: a short reach hit test against creatures, on land or under water. Throwing comes later                                                                                   |
| Saving           | Spawned creatures are not saved, as in Sinew. The inventory is not saved. It lives in memory for one play session                                                                         |

---

## Shore distance

Metres from a water texel to the nearest dry ground. It is worked out in Rust in the terrain worker, next to the water map, and lives in the water map as one more value.

- **Capped.** Distances stop at a cap, for example 256 m. Past it, everything is open water. The cap keeps the work per chunk small.
- **Apron.** Land in the next chunk counts, so the worker reads coverage a cap's width past the chunk's edge. Terrain is made from the seed, so the worker can work out a neighbour's ground without waiting for it.
- **Two passes.** A chamfer distance pass forward and back over the grid. At 8 m texels this is a small grid.
- **Edits.** Sculpting or the water brush rebuild the water map, and the distance with it.

**Why not the GPU.** Habitat checks and spawn planning run on the CPU. A GPU distance field would need a readback to be any use to them. Start in Rust, measure, and move it only if the worker time shows it.

---

## Zones

Depth and shore distance describe the sea well enough. The default continent has a shelf 6 m deep at its edge and an ocean floor 45 m down, so the zones follow those shapes:

| Zone       | Depth          | Shore distance  | Lives there                              |
| ---------- | -------------- | --------------- | ---------------------------------------- |
| Shallows   | 0 – 2 m        | 0 – 20 m        | Guppies, crabs, seagrass                 |
| Shelf      | 2 – 6 m        | To the shelf edge | Sardines, sharks, kelp, coral          |
| Open water | 6 m +          | Past the shelf  | Tuna, sardines, sharks, orcas, jellyfish |
| Deep       | Past the floor | Far out         | Anglerfish                               |

**Deep water.** 45 m is not deep enough to feel dark, so Stage 4 deepens the ocean floor. See The deep.

## Sea biomes

Land biomes are picked by temperature and moisture. Moisture means nothing under water, and a land biome on the coast should not decide what grows 30 m down. So under water gets its own biomes, in `ClimateConfig.sea` (`biomes/SeaBiomes.ts`).

- **Picked by temperature and zone.** Temperature uses the land's bands, so a cold coast has a cold sea. Zones take the place of moisture: `sea.cells[temperatureBand][zone]` names the sea biome.
- **Zones.** A zone is a water type with optional `depth` and `shore` selectors. Its weight is the product of them. Where zones overlap, they share the bed by those weights, so the zones should cover all water between them.
- **Lakes.** A zone with `waterType: 'lake'` is the lake bed, so lakes get their own biome. A lagoon, which is part ocean and part lake, blends the two.
- **What a sea biome owns.** The bed surface (`layers`, with the same rules as land layers), scatter and creatures. It does not shape the ground. The continent and the land biomes still do that.
- **The waterline.** Land biome rules keep the edge of the water, such as reeds with `underwater: true`. Over `sea.handover` (0.3 to 1.5 m of water) the sea biomes take the bed over from the land layers and the beach.
- **Blending.** Sea biomes blend across temperature cuts and zone overlaps, the same as land biomes.
- **Rare things.** Scatter's `noise` selector makes patches. A narrow band with a low density makes rare outcrops.
- **Materials.** Sea layers share the climate's eight splat channels. The default climate's land and coast fill all eight, so its sea reuses their sand, rock and leaf litter.

The default zones:

| Zone     | Water | Depth     |
| -------- | ----- | --------- |
| Shallows | Ocean | 0 – 3 m   |
| Shelf    | Ocean | 2 – 20 m  |
| Slope    | Ocean | 16 – 35 m |
| Open     | Ocean | 28 m +    |
| Lake     | Lake  | Any       |

| Sea biome       | Temperature | Zone     | Bed                 | Grows                           | Lives there |
| --------------- | ----------- | -------- | ------------------- | ------------------------------- | ----------- |
| Seagrass meadow | Any         | Shallows | Sand                | Seagrass, pebbles               |             |
| Kelp forest     | Cold, mild  | Shelf    | Sand, rock patches  | Sugar, giant, boa and bull kelp |             |
| Coral reef      | Warm        | Shelf    | Sand, reef rock     | Seagrass, rare rock outcrops    |             |
| Sand flats      | Any         | Slope    | Sand                | Little                          | Tuna        |
| Open ocean      | Any         | Open     | Sand                | Nothing                         | Tuna        |
| Lake bed        | Any         | Lake     | Leaf litter, stones | Pondweed, weed                  |             |

The arid climate has a warm sea throughout: coral on every shelf. Coral models do not exist yet; the reef grows rock outcrops until they do. The deep comes with Stage 4.

Scatter rules in a sea biome use the same shapes as land rules. Every one grows under water, so it has no `underwater` flag:

```ts
{
  name: 'kelp-forest',
  layers: [{ material: 'aerial_beach_01' }, { material: 'aerial_rocks_01', noise: { ... } }],
  scatter: [{ layer: 'kelp_01', density: 0.45, shore: [{ from: 15, to: 30 }, { from: 220, to: 180 }] }],
  creatures: [{ creature: 'sardine', density: 0.2 }],
}
```

The creature's own habitat still decides where it may move.

**Where it runs.** In Rust, `SeaResolver` (`sea.rs`) turns the water at a point into sea biome weights. The splat reads the chunk's water and shore distance, so the worker builds the water map first, and a water edit rebuilds the splat. Scatter weighs sea rules by the same weights. The far map sees only the ocean, from the coast out. Spawning plans sea biome creatures like land ones, and reads their weights through `BiomeProbe.probeSea`. `showSeaBiomes()` prints the weights at the player.

**Later.** Creatures that keep to a scatter asset, such as fish that stay in the kelp.

---

## Habitats

### Water

The water habitat gets `depth` and `shore` selectors. The swim band can be measured from the bed or from the surface, so a ray keeps near the bed and a jellyfish near the top.

### Bed

For crabs. The creature walks the bed, tilts with its slope, and keeps under a depth of water. Crabs use clips only. Foot planting is kept for big or complex animals. Lakes and sea both work.

### Surface (Stage 4)

For orcas resting, breathing and doing surface actions. The pivot sits at the water level. Near ones read wave height from the GPU probe (32 points, a few frames late). Far ones use the rest level.

### Out of the water

A water creature on land is stranded. Today it stands still. In Shoal each preset says what it does, and how fast it loses health:

```ts
stranded: { act: 'flail', damage: 10 } // health a second
```

| Act     | What it does                                                                          | Used by           |
| ------- | ------------------------------------------------------------------------------------- | ----------------- |
| `flail` | Rolls onto its side and the swim driver bends the body in fast, uneven bursts         | Fish, sharks      |
| `pose`  | Holds its current pose, still                                                         | Orcas, crabs      |
| `clip`  | Plays a named clip                                                                    | Any with one      |

When health runs out, it dies. A fish thrown on land by the spear does the same.

---

## Swimming

A fish swims with a wave that travels down its body:

- **Amplitude envelope.** The head hardly moves and the tail moves most. Eels bend along the whole body, trout along the rear half, tuna only at the tail.
- **The wave travels** from head to tail, a little faster than the fish swims.
- **Speed changes the frequency.** The tail amplitude stays near 0.2 of the body length.
- **Accumulate the phase** each frame (`phase += frequency * dt`). A phase from `frequency * time` jumps when the speed changes.

### Gaits

| Gait            | What it looks like                                                             |
| --------------- | ------------------------------------------------------------------------------ |
| Hover           | Body almost still. Small tail corrections                                      |
| Cruise          | A steady travelling wave                                                       |
| Burst and coast | A few strong tail beats, then a glide with a straight body. The default cruise |
| Turn            | The whole spine curves into the turn. A bend, not an oscillation               |
| Escape          | The body snaps into a C, then springs out, in about 50 ms                      |

Orcas use the same controller with the wave turned 90°, so the body moves up and down.

### The swim driver

A locomotion driver, the seam Sinew left for it. It reads the movement values (speed, turn rate, climb) and outputs wave values: frequency, amplitude, envelope and spine curve. Modes do not change.

- **Bones.** Tuna, trout, sharks and orcas. A chain layer in the pose pipeline's procedural slot bends the spine bones. Clips still play over it.
- **Shader.** Sardines and guppies. Each vertex has a spine weight and a fin mask, painted in Blender as vertex colours. Each instance sends its phase, amplitude and curve. No skeleton, no CPU pose.

The chain layer serves tails and snakes in the land doc.

---

## Schools

A school is one object. It owns a home (as in Sinew) and its members' positions, headings and speeds in flat arrays. Neighbours come from a small spatial grid rebuilt each frame.

Each member steers by:

- **Separation.** Keep a spacing from near neighbours.
- **Alignment.** Turn toward the heading of near neighbours.
- **Cohesion.** Move toward the middle of near neighbours.
- **Home.** Move toward the school's home.
- **Habitat.** Stay inside the habitat. Cache the water sample per grid cell.
- **Threat.** Turn away from the player or a predator.

Stage 1 schools cruise and get out of the way. Stage 4 adds milling, splitting round a threat, the bait ball and the flash, mostly by tuning the weights per state.

### Losing members

A member hit by a spear or bitten by a predator dies. The school gets smaller. A school below its size refills slowly while the player is more than a set distance away, so a reef is not emptied for good.

---

## Health and death

One health model serves creatures and the player.

- **Health.** A number and a maximum, per creature. Presets set the maximum.
- **Damage.** An amount and a source: the player, a creature, the world (stranding, a fall).
- **Reaction.** A hurt creature switches to its flee locomotion set or fights back, by preset. A shark that is speared may turn on the player.
- **Death.** See Death.
- **Despawn.** A body despawns after a time, or when the player is far away.

### Death

No death clip. Death is procedural, so every creature gets it for free:

- **Belly up.** The body rolls over across a second or two.
- **Limp.** The swim driver's wave fades to nothing and the spine relaxes to a slight curl. School fish do the same in the shader.
- **Drift.** The body sinks or floats, by preset, and sways a little with the water as it goes.
- **Caught.** It can be picked up if the preset says it can be caught.

Crabs and other clip creatures hold their last pose and roll onto their back.

### Hurting the player

The player already has health, and low health already dazes the audio.

- **Jellyfish** sting on contact. A small hit, with a short cooldown.
- **Sharks** bite. A Seek that reaches the player starts an attack: a run, a bite, a turn away, and a circle back.

### Attacks

An attack is an action clip played over the swim driver, such as `bite` with the mouth opening. The preset sets the damage and when it lands:

```ts
attack: { meaning: 'bite', reach: 1.5, damage: 30, hitAt: 0.25, cooldown: 3 }
```

Damage lands `hitAt` seconds into the clip if the target is still inside `reach`. The same shape serves predators biting prey.

Creature damage lowers the player's health. At zero the player dies and the game ends, through the existing game over flow (`InGame.tsx`, `GameOverMenu.tsx`). Shoal adds nothing there.

---

## Predators and prey

A small food chain, not a full ecology.

- **Threats.** Every creature can ask "what threats are near me?". The player and predators answer. Prey reacts to both the same way. The query is shared, so lions and gazelles in the land doc use it too.
- **Hunt.** A new mode for predators. It picks a near school, circles it and makes runs. A run that reaches a member kills it.
- **Sharks** hunt sardines and tuna, and may hunt the player.
- **Orcas** hunt tuna and sharks.

---

## Spear and inventory

The first player tool. Stage 3.

### Inventory

Very basic:

- A few slots, each with an item and a count.
- A hotbar showing the slots. Number keys select one.
- Picking up adds to a slot. Some items stack.
- Items are defined in a library, like templates: a name, an icon, a stack size, and what it does when used.

No crafting, trading, dropping or drag and drop yet. The land and air docs, and later gameplay, build on this.

### Ready for VR

A WebXR headset session shows only what the renderer draws. Page elements do not show in the headset. So:

- **The inventory is plain data** in TypeScript: slots, items, the selected slot. It knows nothing about how it is drawn.
- **Stage 3 draws it with the UI framework**, as a hotbar over the game. This is quick and fits the rest of the UI.
- **A VR port draws the same data in the world**, for example on a wrist or a belt, through the renderer. The data does not change.

The view model follows the same rule: a held object in the scene, attached to the camera. In VR it attaches to a hand instead.

Inventory is not a CPU or GPU question. The data is tiny and lives on the CPU either way. The question is only whether its view is a page element or something the renderer draws.

### Spear

- **Thrust.** Click to thrust. A short reach hit test along the view against creatures and school members. School members live in flat arrays, so the test checks those too. It works on land, wading and under water.
- **Hit.** Damage to the creature, with the player as the source.
- **Catch.** A small fish dies in one hit and goes in the inventory. A large one takes more hits.
- **Fight.** A speared shark may fight back. Hitting a shark during its run turns it away.
- **Later.** Throwing, and picking the spear back up.

The spear needs a first-person view model and a thrust clip. The engine has no view model path yet, so Stage 3 builds one: a held model drawn in front of the camera, with its own clips. Later tools use it too.

---

## Orcas (Stage 4)

- **Pod.** A group of 3 to 6, using a school with few members and a loose spacing.
- **Curious.** A new mode: Inspect. They come close to a still player, circle and keep a distance.
- **Looking.** Sinew's look-at turns the head toward the player, with small yaw and pitch limits, since an orca has little neck. The look-at bones are the front of the spine. Look-at runs after the chain layer, so the head turns from where the swimming body puts it.
- **Breathing.** They rise to the surface, blow and dive.
- **Leaping.** A short ballistic arc out of the water and back in, with a splash.
- **Spy hop and tail slap.** Surface actions, played as clips over the swim driver.
- **Sleeping.** They rest at the surface, slow and still, in a tight group. At night, or at random.
- **Hunting.** They hunt tuna and sharks.

---

## The deep (Stage 4)

The default ocean floor is 45 m down, which is not deep or dark enough. Stage 4 deepens it. Past the slope, the floor falls away to a new, deeper `oceanDepth`, and the deep zone and its sea biome live there.

- **Anglerfish** hang still in the dark and move in short, slow bursts.
- **The lure** is an emissive part of the model, with a small point light attached to it. The renderer already keeps the 32 best lights from up to 256 candidates, so far lures lose their light and keep their glow.

---

## Spawning

- **Rules in sea biomes**, with depth and shore selectors. See Sea biomes.
- **Schools.** A rule's `school` field gives a member count. School rules use the school budget, not Sinew's 100.
- **Distance.** Each habitat sets its spawn radius. Under water the player sees tens of metres, so fish spawn at about 60 m and despawn at about 80 m. Orcas use the normal radius, since the player sees them from the shore.
- **No popping.** Spawn outside the fog edge, unless the player moves fast.

---

## In the editor

Every new creature can be placed in the editor, the same as Sinew's creatures. Where you put it is its home.

- **Schools** are placed as one asset with a member count and a spread. In the editor they hold in place and wave, so you can see them.
- **Bed creatures** snap to the bed under the water, not to the water surface.
- **A warning** shows when a home is outside the habitat, for example a tuna placed in a lake.

Each creature's ticket includes its placement.

### Debug views and commands

- A debug view of shore distance.
- A debug view of sea biome weights.
- Console commands for schools: list them, go to the nearest, show member count and state. They join `showCreatureSpawns()` and `goToCreature()`.

---

## Sound

Susurrus plays the sounds. Each stage lists the files to make when it is ready, and the sound manifest is matched to them.

| Stage | Sounds                                                                |
| ----- | --------------------------------------------------------------------- |
| 1     | Small splashes as fish break the surface near the player              |
| 2     | Flailing on land, a bite, a jellyfish sting, a body hitting the water |
| 3     | Spear thrust in air and under water, a hit, picking up a catch        |
| 4     | Orca calls, blows at the surface, leap and tail slap splashes         |

---

## Quality and performance

- **School fish have no CPU pose.** The shader waves them.
- **Bone fish** use Sinew's pose LOD.
- **Steering LOD.** Far schools steer at a lower rate. A far school out of view moves as one point.
- **No shadows.** Water creatures cast no shadows.
- **Stats.** Add school members alive, schools alive and steering time to the perf panel.

---

## Out of scope

- Land animals that swim, and birds that dive for fish.
- Ocean currents and tides. Jellyfish drift with the wind near the surface.
- Crafting, cooking and trading what the player catches.
- Saving creature state, as in Sinew.
- Plants that react to creatures, such as kelp pushed aside by a fish.
- Multiplayer. Two players see the same spawns, but creatures move differently for each.

---

## Answered questions

- **Test assets.** Tuna, shark, sardine, crab, orca, trout, guppy, jellyfish and anglerfish. See Creatures.
- **School fish weights.** Painted in Blender as vertex colours.
- **Shore distance.** Needed. Rust first, in the terrain worker.
- **Schools go down.** Yes, by predators and the spear. They refill slowly while the player is away.
- **Player death.** The game ends, through the existing game over flow.
- **Inventory saving.** Not saved. In memory for one play session.
- **View model.** New work, in Stage 3.
- **Trout.** Loners that hover in place, then move on. Tuna keep moving as a group.
- **Shadows.** Water creatures cast none.
- **Death.** No death clip. Belly up, limp and drifting.
- **Crabs.** Clips only, no foot planting.
- **Inventory and VR.** Data apart from its view, so a VR port draws it in the world.
- **Sea biomes.** Their own climate grid, by temperature and zone.
- **Deep water.** The ocean floor gets deeper.
- **Anglerfish lure.** Emissive, with a small point light.
- **Breath.** The player already runs out of air under water.
- **Multiplayer.** Out of scope.

---

## TODOs

Each TODO is one GitHub ticket in the Shoal milestone. The order follows the dependencies. "Expect" is what is true when the ticket is done.

### Stage 1: place and swim

- [ ] **1. 3D movement for water creatures**

  - Scope: pitch toward the climb, limited per preset. 3D player distance in Seek and Evade for water creatures.
  - Expect: a tuna tilts nose up as it climbs. A fish 20 m below a swimmer does not flee.

- [ ] **2. Shore distance**

  - Scope: a capped distance to dry ground in the water map, built in Rust in the terrain worker with an apron. Rebuilt on edits. A debug view.
  - Expect: the debug view shows the distance rising from the coast. Worker time stays within budget.

- [ ] **3. Depth and shore rules**

  - Scope: `depth` and `shore` selectors on the water habitat, on creature rules and on scatter rules. Swim bands from the bed or the surface. Spawn radius per habitat.
  - Expect: a fish stays over the depths its habitat allows. Trout only in lakes.

- [ ] **4. Sea biomes**

  - Scope: sea biomes in the climate, picked by temperature and zone, with their own cell grid. Bed layers, scatter and creatures. Weights in the terrain worker, read by the biome probe. Lake beds by water type. A debug view.
  - Expect: a cold coast grows a kelp forest on the shelf, a warm coast a coral reef with rare coral heads, and the shallows seagrass. Lakes have weed beds.

- [ ] **5. Swim driver**

  - Scope: the swim controller with phase, envelope, gaits and turn curve. The chain layer in the pose pipeline. The Hold mode. Tuna and trout.
  - Expect: tuna and trout swim with no swim clip, burst and coast, and curve into turns. A trout hovers in place, then moves on.

- [ ] **6. Shader swim**

  - Scope: an instanced pass with no skeleton. Per-instance wave values. Painted spine and fin weights. Guppies.
  - Expect: 1,000 fish draw in one call each model, each waving at its own phase. Guppies in the shallows dart away from the player one by one.

- [ ] **7. Schools**

  - Scope: the school object, flat member arrays, spatial grid, steering, habitat checks, the school budget, school spawn rules. Placing a school in the editor. Console commands.
  - Expect: sardines stream past and part round the player. A placed school holds in place in the editor.

- [ ] **8. Bed creatures and jellyfish**

  - Scope: the `bed` habitat. Crabs with clips. Jellyfish with a pulse clip and slow drift. Placing both in the editor.
  - Expect: crabs walk the bed of the sea and of a lake. Jellyfish drift and pulse.

### Stage 2: life and death

- [ ] **9. Health and death**

  - Scope: health and damage with a source, shared with the player. Procedural death: belly up, limp, sink or float, despawn. The `stranded` preset rule: flail, pose or clip.
  - Expect: a fish dropped on the shore flails on its side and dies. A stranded crab stays still. A body rolls belly up, sinks or floats, and goes after a time.

- [ ] **10. Threats and sharks**

  - Scope: the shared threat query. The hunt mode. Attacks as action clips with `hitAt`. The shark. Jellyfish stings. Schools lose members and refill.
  - Expect: a shark circles a school and kills members. A shark can bite the player. A jellyfish stings on contact.

- [ ] **11. Stage 1 and 2 sounds**

  - Scope: the sounds for Stages 1 and 2. See Sound.
  - Expect: fish splash, flail, bite and sting with sound.

### Stage 3: spear and catch

- [ ] **12. Basic inventory**

  - Scope: inventory data apart from its view. Slots, an item library, pick up and select. A hotbar drawn with the UI framework.
  - Expect: the player picks up an item and sees it on the hotbar.

- [ ] **13. View model**

  - Scope: a held model in the scene, attached to the camera, with its own clips.
  - Expect: the player holds a spear in view, and it plays a thrust.

- [ ] **14. Spear**

  - Scope: the thrust, the hit test against creatures and school members, damage, catching into the inventory. Spear sounds.
  - Expect: the player spears a trout or a sardine and it goes in the inventory. A speared shark turns away or fights back.

### Stage 4: orcas and the deep

- [ ] **15. Orcas**

  - Scope: the `surface` habitat, the up and down wave, pods, Inspect, look-at with small limits, breathing, leaping, spy hop, tail slap, sleep, hunting. Orca sounds.
  - Expect: a pod swims along the coast, rises to breathe, leaps, comes to look at a still player, and sleeps at night.

- [ ] **16. The deep and anglerfish**

  - Scope: a deeper ocean floor, the deep sea biome, the anglerfish, its emissive lure and point light.
  - Expect: past the shelf the bed falls away into the dark, and anglerfish hang there with their lures glowing.

- [ ] **17. School shapes**

  - Scope: milling, splitting, bait ball and flash, by state.
  - Expect: sardines ball up when a shark circles.

- [ ] **18. Steering LOD and stats**

  - Scope: steering rate by distance, far schools as one point, perf panel counts and time.
  - Expect: 1,000 members fit the frame budget, and the perf panel shows their cost.
