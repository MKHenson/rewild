# Sinew

Working doc. It is for planning this work, not a milestone write up. When the work ships, rewrite it as a guide, the same as Pelagic.

## Goal

The world gets creatures that move. A creator places a chicken in the editor, or the world spawns chickens in a meadow. In both cases the chicken walks, pecks, looks at the player and runs away. Its feet touch the ground on a slope. Birds circle overhead, and a fish keeps to the lake.

Sinew is the body: skeletons, clip animation, procedural corrections on top of clips (look-at, foot IK) and simple movement. Procedural locomotion, where code makes the motion and no clip plays, is the next milestone (see Next: procedural locomotion). The mind (needs, memory, groups, real AI) is a later milestone.

---

## Decisions

Rows marked **Proposed** need a yes from Mat before work starts.

| Topic                    | Decision                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source format            | Blender exports glTF (`.glb`). Skins, joints, weights and animation clips come from the glTF. There is no custom format                                                                                            |
| Skinning                 | GPU skinning in the vertex shader, always instanced. One draw for each model, the same as scatter. Up to 4 joints for each vertex. The CPU writes each instance's joint matrices and parameters to storage buffers |
| Pose order               | Each frame: sample clips, blend, procedural layers, IK, joint matrices, GPU. Look-at and IK are layers in this order, never patches on clips. Later procedural layers use the same slot                            |
| Shared data              | Instances of one model share the skeleton, the clips and the geometry. Each instance owns only its pose and its behaviour state                                                                                    |
| Scale                    | A herd is up to 20 animals. Up to 100 creatures are alive at once. Every creature builds a full pose on the CPU                                                                                                    |
| Pose data                | One shared buffer for each model. Each creature owns a fixed slot in it, not an array of its own. See Pose buffers                                                                                                 |
| A creature is a template | A creature template names its model, its behaviours, its clip map and its locomotion sets. Placed and spawned creatures use the same template, so a chicken is a chicken in both cases                             |
| Behaviours               | Each asset gets its own behaviour instances on load. A behaviour owns its state, for example Wander's target and timer. Each behaviour can save and restore its state as plain data                                |
| Movement                 | Kinematic. The creature's habitat decides where it may be (see Habitats)                                                                                                                                           |
| Habitat                  | Each template names its habitat: land, under water, water surface or air. The field is a list, but Sinew accepts one entry                                                                                         |
| Air                      | Airborne only. Birds stay inside a height band and roll into turns. Take-off, landing and perching come later                                                                                                      |
| Medium transitions       | Out of scope. A land animal that swims, a bird that lands, a duck that walks into a pond: these are one problem, solved later for all of them                                                                      |
| Basic behaviours         | Wander, Chase and Flee. Flee is Chase reversed                                                                                                                                                                     |
| Movement and actions     | Behaviours set movement (a target, a speed and a turn rate) and the locomotion set. They never play locomotion clips. They play and stop action clips by meaning, for example `eat`                                |
| Clip names               | Clips are named by meaning: `idle`, `walk`, `run`, `eat`. A template maps a meaning to a clip only where the names differ                                                                                          |
| Speed blend              | Locomotion clips blend by the creature's ground speed, with their cycles in step. A clip never plays fast or slow to match a speed, beyond a small rate correction that stops foot slide                            |
| Locomotion driver        | Sinew has one driver: the animation controller's locomotion part, which blends clips. Procedural locomotion adds other drivers, for example a swim controller, with no change to behaviours                        |
| Procedural locomotion    | Out of scope. Fish, snakes, tails and spring bones are the next milestone                                                                                                                                          |
| Saving                   | **Proposed.** Sinew saves only authored data. Runtime state (where a creature walked, if it died) resets on each load. See Saving                                                                                  |
| Player body              | **Proposed.** Out of scope. The game stays first person. The skeleton system must not assume an AI drives it, so a player body can use it later                                                                    |

---

## Import

`GltfLoader` reads static node trees today. It must also read:

- `skins`: the joint nodes and the inverse bind matrices.
- The `JOINTS_0` and `WEIGHTS_0` vertex attributes.
- `animations`: each clip's channels (translation, rotation, scale) with their samplers. Support linear and step. Cubic spline can wait.

The loaded model keeps one skeleton and its clips. Many instances use them.

### Blender conventions

- One armature for each creature. Apply scale and rotation before export.
- Name clips by meaning, not by look: `idle`, `walk`, `run`, `eat`. A clip with a shared name needs no entry in the clip map.
- Start every walk and run loop on the same foot contact, for example the left foot down. The speed blend keeps cycles in step by this.
- Name the bones that procedural layers use: `head`, `neck_*` and the leg chains. The template names them, so the names do not have to match exactly.

---

## Herds and instancing

A herd is up to 20 animals, and up to 100 creatures are alive at once. At that scale every creature can build its full pose on the CPU, look-at and IK included. A creature is a `SkinnedInstance`: a pose, and a `SkinnedMesh` per material on its transform, placed like any `Mesh`. Each creature is culled on its own, and every visible creature of one model is one instanced draw per material. The CPU writes every pose's joint matrices to a storage buffer, and the shader reads them by each drawn creature's slot.

### Pose buffers

- Each model has one shared `Float32Array` for pose data. Each creature owns a fixed slot in it: a range of the array, found by its slot index. No creature has a separate array, and no bone is an object.
- There are two buffers for each model. The working pose (position, rotation and scale for each bone) is the input. The joint matrices are the output. Only the output matches the GPU layout.
- The output upload is one `writeBuffer` for each model each frame. Each draw also writes a short list of the visible creatures' world matrices and slots, and the shader finds a creature's joint matrices at `slot × joint count`.
- Live creatures fill slots 0 to N−1. When a creature despawns, the last creature moves into its slot (swap-remove), so the buffer stays packed.
- A moved creature's slot index changes. Other code refers to a creature by a stable handle that maps to its slot, and never keeps a slot index.
- This layout lets a worker take the whole job with one buffer. It also lets WASM build every pose in one call over its own memory, with JS reading the result through views. Many small calls or copies for each creature would lose the gain.

### If counts grow

If a later game needs hundreds of animals, add baked clips. Each clip is sampled into joint matrices at load and stored in a GPU texture. Far instances then sample the bake on the GPU, and only near ones build a CPU pose. The instanced shader already reads joint matrices from a buffer, so a baked source does not change the draw. This is a recorded option, not Sinew work.

### Herd spawning

A spawn rule can spawn a group: some animals round one shared home. The home drifts slowly, and each animal wanders near it, so the group moves together without steering AI. Real herd steering (cohesion, a leader, the herd running as one) belongs to the mind milestone.

---

## Pose pipeline

1. **Sample.** Sample the active clips at their times.
2. **Blend.** Mix the active clips by their weights: the speed blend, actions and crossfades. A creature has up to 6 active clips, so its slot size is fixed. Six covers a speed blend crossfading between two locomotion sets while an action fades out. Each model's `ClipPlayer` keeps every creature's clips (clip, time, rate, weight and fade) in flat arrays beside its pose slot, and they move with it on swap-remove. If the weights sum to less than 1, the rest pose fills the remainder, so a clip that fades out alone settles into the rest pose. Weights over 1 are normalised. Rotations blend as a weighted sum on one hemisphere, then normalise.
3. **Procedural layers.** Look-at. The next milestone adds chains and spring bones here.
4. **IK.** Foot placement.
5. **Joint matrices.** Multiply by the inverse bind matrices and write the result to the storage buffer.

Each layer has a weight from 0 to 1. A weight of 0 skips the layer and costs nothing.

### Look-at

- Spread the rotation across the neck bones and the head. The head takes the largest share.
- Limit yaw and pitch. Out of range, the creature looks forward again.
- Smooth the change, so the head turns and does not snap.

### Foot IK

- Two-bone analytic IK for each leg.
- Ground height comes from the terrain heightfield, not from a raycast.
- Lower the pelvis by the largest foot drop, so a leg is never stretched.
- Quadrupeds also tilt the body to the slope from the front and back feet.

---

## Creatures

### Templates

A creature template adds to the asset template:

- `behaviors`: for example `["wander", "flee"]`. The field exists today.
- `clips`: maps a meaning to a clip name, only where the names differ. A missing entry falls back to the clip with the same name.
- `locomotion`: named sets of locomotion clips. `normal` is the default. A missing entry in another set falls back to `normal`.
- `clipSpeeds`: the natural ground speed of each locomotion clip, in m/s.
- `bones`: the bone names for look-at and IK.
- `driver`: the locomotion driver. Sinew has only `clips`.
- `movement`: top speed and turn rate.
- `habitat`: a list with one entry in Sinew, and that habitat's limits (see Habitats).

### Behaviours

Today `BehaviourManager` holds one `Spin` that all spinning assets share. That was a first version. In Sinew:

- `BehaviourManager` becomes a registry that maps a behaviour name to a factory.
- `TemplateLoader` creates new behaviour instances for each asset on load.
- Each instance owns its state. Wander keeps its target and its timer. Chase keeps its target.
- `IBehaviour` gets `serialize()` and `restore()`. They write and read the state as plain data, so a later save layer can store it.
- At runtime a behaviour can hold direct references, for example Chase holds its target. `serialize()` writes the target's stable id, not the object.

### Movement

- Wander picks a point near the creature's home, walks to it, waits, then picks again.
- Chase and Flee react to the player inside a radius.
- Each behaviour sets movement: a target, a speed and a turn rate. It does not move the creature or play a locomotion clip.
- A behaviour can set the locomotion set, and play or stop action clips.

### Animation controller

Each creature has an animation controller. It makes all animation decisions. Behaviours tell it what they want.

**Locomotion.** The controller reads the creature's ground speed and blends the clips of the active locomotion set: `idle`, `walk`, `run`.

- Each clip has a natural speed: the speed its feet carry the body at normal rate. For example, a chicken's `walk` is 1.2 m/s and its `run` is 4 m/s.
- At 2.6 m/s, the controller plays about half `walk` and half `run`. The clips share one cycle, so the feet stay in step.
- The playback rate changes only a little, to remove the last foot slide.
- At zero speed, locomotion is all `idle`.

**Locomotion sets.** A set is a version of locomotion. A behaviour or a health state picks it, and the controller crossfades to it.

```json
"locomotion": {
  "normal":  { "idle": "idle", "walk": "walk", "run": "run" },
  "injured": { "idle": "idle-hurt", "walk": "limp" }
}
```

The injured deer has no `run` of its own, so it uses the normal `run`. If an injured deer must not run, its behaviour caps the speed. A creature with no `injured` set walks normally, so a behaviour can ask for any set on any creature.

**Actions.** A behaviour plays an action clip by meaning: `animator.play('eat')`, `animator.stop('eat')`. The controller fades it in over locomotion and fades it out when it ends or stops. The behaviour decides the rest. Wander stops moving while the chicken eats. Flee stops the `eat` action before it runs.

**Idle variety.** While a creature stands still, the controller plays a random idle action now and then, for example `look`, `scratch` or `shake`.

**The seam.** Behaviours never play locomotion clips, so Shoal can swap the locomotion part for a swim controller with no change to behaviours.

### In the editor

Behaviours do not run in the editor. A placed creature plays its `idle` clip in place, so the creator sees that it is alive.

---

## Habitats

A habitat says where a creature may be. The locomotion driver says how its body moves. They are separate, so a fish's habitat rules do not change when Shoal gives it a swim controller.

One check answers "can this creature be at this point?". Three things use it:

- **Spawning.** Is this a valid spawn point?
- **Wander.** Is this a valid target?
- **Each step.** Is the next position still valid? A deer stops at the shore and does not walk into the lake.

| Habitat       | Rules                                                                                                | Data                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Land          | Dry ground, or water no deeper than a wade depth. Slope under a limit                                | The heightfield, `WaterQuery` depth                     |
| Under water   | A depth range. A margin above the bed and below the surface. Allowed water types (lake, ocean, tarn) | `WaterQuery`: `ground`, `level`, `depth`, `typeWeights` |
| Water surface | Sits on the surface. Allowed water types                                                             | `WaterQuery`: `level`, and waves for near creatures     |
| Air           | A height band above the ground or the water. Look ahead along the path and climb before a hill       | The heightfield, `WaterQuery` level                     |

### Water

- `WaterQuery` has the map data now, with no delay.
- Wave height comes from the GPU probe. It has 32 points (`PROBE_POINTS`) and reports a few frames late. Surface creatures use the rest level. Only the closest few get a probe point for real wave bob.
- The test fish in Sinew moves with a swim clip. Its body motion becomes procedural in Shoal, and its habitat rules stay the same.

### Air

- A bird flies at a height inside its band. Wander picks targets in three dimensions.
- A bird's locomotion set has `glide` and `flap`. The controller blends them from the climb rate and the speed.
- The root rolls into turns from the turn rate. This is a root transform, not a procedural layer.

---

## Placement and spawning

- **Placed.** The creator places a creature like any asset. Its placement is its home. The editor warns when the home is outside the habitat, for example a deer placed in a lake. Placements save with the level today, so this needs no new storage.
- **Spawned.** A spawn rule says which creatures appear in which biome, and how many. Like scatter, the seed and the chunk decide each spawn, so the same chunk gives the same chickens every time. A spawn point must pass the habitat check. Air creatures spawn inside their band. Creatures spawn inside a radius of the player and despawn outside it.

A spawned creature gets a stable id from its chunk and its index. A later save can find it again by that id.

---

## Saving

There are three kinds of creature data:

| Data                | Example                          | Saved today?                          |
| ------------------- | -------------------------------- | ------------------------------------- |
| Authored placements | The creator puts a chicken here  | Yes, with the level                   |
| Spawned creatures   | The meadow has chickens          | Not needed. The seed makes them again |
| Runtime state       | The chicken walked 30 m, or died | No                                    |

Runtime state is a player change to the world. Project Promotion already decided where player changes go: a separate layer on top of the authored level, with a project setting for its scope. Saving runtime state is that layer's work, not Sinew's.

**Proposed:** Sinew does not save runtime state. It keeps two rules so the layer can save it later:

- Every creature has a stable id, placed or spawned.
- Each behaviour can write its state as plain data, with stable ids in place of live objects.

---

## Performance

- Distant creatures update their pose at a lower rate, for example 15 Hz.
- Look-at and IK stop past a range.
- Creatures outside the main camera and every shadow camera still move, but do not build a pose.
- Shadows use the same instance data, so they match the main pass.
- Add creature counts and pose time to scene stats.

### If pose time grows

Go in this order, and move to the next step only when scene stats show the need:

1. **Plain TypeScript on flat arrays.** This is the Sinew work.
2. **A Web Worker.** Pose work leaves the main thread, the same pattern as `TerrainWorkerPool`. The pose arrives one frame late, so footstep events and bone positions lag by a frame. The worker needs the clips, the skeletons, the movement values and the terrain heights. Shared memory needs cross-origin isolation headers.
3. **WASM.** With SIMD, often 2 to 3 times faster than typed-array JS for this math. It adds a second language and a build step. At the counts that need it, baked clips (see If counts grow) can be the better choice.

---

## Out of scope

- A player body and a third-person camera.
- AI: needs, memory, perception past a radius, path finding round obstacles.
- Procedural locomotion (see Next: procedural locomotion).
- Group steering: herds, flocks and fish schools that steer as one. Herds can spawn as a group (see Herd spawning).
- Medium transitions: take-off, landing and perching, land animals that swim, and creatures with more than one habitat.
- Ragdoll, blend trees, root motion.
- Actions on part of the body only (bone masks), and additive clips.
- Saving runtime state (see Saving).

---

## Next: procedural locomotion

A later milestone, possibly named Shoal. Fish lead it. These notes keep the thinking from the Sinew planning.

### How fish swim

A fish swims with a travelling wave down the body, not a plain sine:

- **Amplitude envelope.** The head hardly moves and the tail moves most. Eels bend along the whole body, trout along the rear half, tuna only at the tail.
- **The wave travels** from head to tail a little faster than the fish swims.
- **Speed changes the frequency.** The amplitude stays near 0.2 of the body length at the tail.

Other motions sit on top of the wave:

| Motion          | What it looks like                                                                 |
| --------------- | ---------------------------------------------------------------------------------- |
| Hover           | Body almost still. Pectoral fins scull. Small tail corrections. Gills move         |
| Cruise          | A steady travelling wave                                                           |
| Burst and coast | A few strong tail beats, then a glide with a straight body. The most lifelike gait |
| Turn            | The whole spine curves into the turn. A bend, not an oscillation                   |
| Escape          | The body snaps into a C, then springs out, in about 50 ms                          |
| Brake           | Pectoral fins flare and the body pitches                                           |

### Design direction

- **Swim controller.** A locomotion driver. It reads the movement values, picks the gait, and outputs wave values: frequency, amplitude, envelope, spine curve and fin motion.
- **Accumulate the phase** each frame (`phase += frequency * dt`). Phase from `frequency * time` jumps when the speed changes.
- **Two ways to apply the values**, from one controller:
  - Hero fish use bones. A chain layer in the procedural slot applies the wave and the curve. Clips can add the escape and fin flicks.
  - School fish use the vertex shader with per-instance parameters. Masks painted in Blender give each vertex its weight along the spine and mark the fins. ABZÛ used this approach (GDC talk on the fish of ABZÛ).
- **Burst and coast is the default cruise.**
- The same chain layer serves tails and snakes. Spring bones serve ears and wattles.

### Also later

- **Fish collectives.** Fish move as schools, and swimming gets more work than Sinew gives it.
- **Medium transitions.** Birds take off, land and perch. Land animals swim. Ducks and frogs use more than one habitat. Each needs an approach check, a blend between heights and a clip change, so one system serves all of them. Sinew's `habitat` list leaves room for this.

---

## Answered questions

- **Test assets.** Mat makes them in Blender: a chicken, a quadruped, a bird and a fish, with clips.
- **Spawn caps.** Spawn rules work like scatter rules today. There is no cap for each project.

---

## TODOs

Each TODO becomes one GitHub ticket. The order follows the dependencies. "Expect" is what is true when the ticket is done.

- [ ] **1. Skinned glTF import**

  - Scope: read skins, inverse bind matrices, `JOINTS_0`, `WEIGHTS_0` and animation clips in `GltfLoader`. The model keeps one skeleton and its clips.
  - Expect: loader specs cover a skinned model with two clips. Static models load as before.

- [ ] **2. Instanced GPU skinning**

  - Scope: an instanced skinned variant of the standard pass and the shadow pass. Per-instance joint matrices and parameters in storage buffers. Stable creature handles that map to slots, with swap-remove.
  - Expect: 20 copies of a skinned model render in their bind pose in one draw, with correct shadows. Removing a creature moves the last one into its slot, and its handle still finds it.

- [ ] **3. Clip playback and crossfade**

  - Scope: sample and blend steps of the pose pipeline on the CPU, on flat pose arrays. Up to 6 weighted clips for each instance. Play, stop, crossfade and rate.
  - Expect: 20 instances each play their own clip at their own time, and crossfade from `idle` to `walk` with no pop.

- [ ] **4. Behaviour instances for each asset**

  - Scope: `BehaviourManager` becomes a registry of factories. `TemplateLoader` creates behaviour instances for each asset. Add `serialize()` and `restore()` to `IBehaviour`. `Spin` keeps working.
  - Expect: two assets with one stateful behaviour keep separate state. A behaviour's state survives `serialize()` then `restore()`.

- [ ] **5. Animation controller**

  - Scope: the speed blend with cycles in step, locomotion sets with fallback to `normal`, actions with play and stop, idle variety. The `clips` map with fallback to shared names.
  - Expect: a test creature speeds up from `idle` to `run` with no foot slide and no pop. An `injured` set swaps `walk` for `limp`. An action fades in over locomotion and out again. The editor plays `idle` on placed creatures.

- [ ] **6. Creature templates and movement**

  - Scope: the creature template fields. The habitat check with the land habitat. Wander, Chase and Flee set movement. The locomotion driver moves the creature on the heightfield.
  - Expect: a placed chicken wanders near its home, eats, and runs from the player. Flee stops the `eat` action. It stops at the shore. No behaviour plays a locomotion clip.

- [ ] **7. Water and air habitats**

  - Scope: the under water, water surface and air habitats. Probe points for the closest surface creatures. Wander in three dimensions for air and water. Root roll into turns. The editor warning for a home outside the habitat.
  - Expect: a fish stays in its lake between the bed and the surface. A bird circles inside its band and climbs before a hill. A surface creature bobs on waves near the player.

- [ ] **8. Look-at layer**

  - Scope: the procedural layer step, and look-at across the neck and the head with limits and smoothing.
  - Expect: the chicken turns its head to the player inside a radius, and looks forward when the player is behind it.

- [ ] **9. Foot IK**

  - Scope: two-bone IK for each leg, pelvis drop, body tilt for quadrupeds.
  - Expect: on a slope, feet touch the ground and no leg stretches. A quadruped tilts with the slope.

- [ ] **10. Spawn rules**

  - Scope: spawn rules for each biome, seeded for each chunk, spawn and despawn by distance, stable ids. Group spawns with a drifting home.
  - Expect: a meadow has the same chickens each time it loads. A plain has a herd that moves together. Fish spawn only in water, birds only in the air.

- [ ] **11. Animation LOD and stats**

  - Scope: pose update rate by distance, look-at and IK range, no pose off screen. Scene stats for creatures and pose time.
  - Expect: 100 live creatures fit the frame budget, and scene stats show their pose time.
