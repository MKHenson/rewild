# Susurrus: Sound Milestone

> **Draft.** This is a working plan. The decisions and phases can change.
>
> _Susurrus_ means a soft whisper or rustle, like wind in the leaves. Rewild is silent today.
> Susurrus gives the world a voice: the wind, the rain, the thunder, the water and the land the
> player stands on.

## Overview

Rewild has no audio today. There is no `AudioContext`, no sound files and no audio settings. The
only trace is that the dev server already serves `.mp3`, `.ogg` and `.wav` from `/assets/shared/`.

The game is mostly outdoors, so most of its sound comes from systems that already exist:

| System                                      | What the player should hear                                   |
| ------------------------------------------- | ------------------------------------------------------------- |
| Weather (`AtmosphereSystem`, `SkyRenderer`) | Wind that rises and gusts. Rain and the quiet of snow.        |
| Wind on the player (`Headwind.ts`)          | A roar in the ears when facing into a gale. Quieter downwind. |
| Lightning (`LightningController`)           | Thunder from the strike's direction, late by its distance.    |
| Water (`WaterQuery`, `Swimming.ts`)         | Surf, lake lapping, wading, swimming, diving and surfacing.   |
| Under water (`Player.cameraUnderWater`)     | The world goes muffled. An under-water bed takes over.        |
| Biomes (`ClimateField`, `Biomes.ts`)        | Each biome has its own sound, and the weather changes it.     |
| Time of day (`DayNightCycle`, `Moon`)       | Dawn chorus, daytime insects, night crickets and owls.        |
| The player (`Player.ts`)                    | Footsteps, slides, breath, pain, heat, cold and death.        |

The work has four parts:

1. **The audio engine.** A small engine on the Web Audio API: buses, a sound manifest, beds,
   3D emitters, the listener, settings and debug commands.
2. **Weather sound.** Wind, rain, snow and thunder.
3. **The player.** Under-water sound, swimming, splashes, footsteps, sliding, breath and death.
4. **The land.** Surf, biome soundscapes with weather rules, day and night, and wildlife calls in
   3D.

The engine is a library and knows nothing about the game. The game systems own their own sound
as plain classes that use the engine. The `Player` owns one `PlayerSounds`, which holds every
player sound, and tells it the player's state each frame. The soundscape owns the weather and the
land. A system can drive its sound
from its own update or from an event, whichever fits.

There are no animals yet. Wildlife sound comes from biome beds and from one-shot calls placed in
3D around the player. The emitter API is the one creatures will use when they arrive.

## Goals

- One **audio engine** on Web Audio, owned by the game and updated once each frame.
- A **mixer** with buses: master, music, world (ambience, weather, effects), player and UI.
- **3D sound.** A `PannerNode` per emitter and an `AudioListener` that follows the camera.
- **Beds**: looping layers whose volume and tone follow a game value smoothly, with no clicks.
- A **sound manifest** in `templates/sounds.json`, in the same pattern as `materials.json`.
- **Wind** that follows `windiness`, the gusts at the player and the direction the player faces.
- **Rain and snow** that follow `precipitation` and `temperature`.
- **Thunder** from the strike position, delayed by the speed of sound.
- **Under water**: a muffled world and an under-water bed, with splashes on the way in and out.
- **Surf and lapping** that follow the shore distance and the sea state / lakes.
- **Biome soundscapes** that blend with the biome weights at the player. **Weather rules** add,
  replace or scale their layers, so a forest in a gale sounds different from a calm one.
- **Footsteps** from the ground material under the foot, with rules for wet ground, wading,
  sprinting and crouching. Landings from the fall speed.
- **Sound in the editor**, turned on and off with a button in the editor's position readout.
- An **Audio tab** in the settings panel, with a few sliders that cover every bus. Settings persist
  like `QualitySettings`.
- **Debug commands** for the audio state, volumes and test sounds.
- Run unchanged in Chrome and in Electron.

## Non-goals (deferred)

- **Music.** The music bus and its slider exist, but no music system or score is in this milestone.
- **Creatures.** No animal entities exist. Their sound waits for the creatures milestone.
- **Occlusion and sound propagation.** No ray casts against terrain or trees in this milestone.
- **Reverb from the terrain.** Valleys and cliffs that echo are a stretch goal (step 23).

## Key technical decisions

| Decision           | Choice                                                                             | Why                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audio API          | **Web Audio**, used directly                                                       | The target is Chrome and later Electron, which is Chromium. Web Audio behaves the same in both.                                                                                                          |
| Middleware         | **None**                                                                           | FMOD and Wwise add licences, a large WASM download and an authoring tool. The goals do not need them.                                                                                                    |
| Custom DSP         | **None in this milestone**                                                         | Panners, filters, convolvers and gains are native nodes on the audio thread. JS only sets their parameters.                                                                                              |
| Where it lives     | **`AudioEngine`** in `packages/rewild-audio`, **soundscape** in `src/core/audio/`  | The engine knows nothing about the game. The soundscape reads the listener, the sky and the water.                                                                                                       |
| Player sound       | **`PlayerSounds`**, owned by `Player`, fed a state each frame                      | The player sound stays out of `Player`, which only fills in a few values and calls `update`. The state is one reused object, so a frame allocates nothing.                                               |
| Biome sound        | **Soundscape profiles** with **weather rules**, in `templates/soundscapes.json`    | A forest in a gale sounds different from a calm forest. Rules add, replace or scale layers. See [Soundscapes](#soundscapes).                                                                             |
| Rule engine        | **One shared `RuleSet`** in `packages/rewild-audio`, for soundscapes and footsteps | Biome sound and footsteps both need "when the world is like this, change these sounds". One engine, one format, one test suite.                                                                          |
| Rule conditions    | **Ranges on weather values**, and weather states eased over seconds                | The weather knobs ease and wander. A range follows them, so a layer fades in as the wind rises, not at a state change.                                                                                   |
| Update point       | **`GameManager.onUpdate`**, after `renderer.onFrame()`                             | The player has moved, the sky has its new weather sample and the camera matrix is current.                                                                                                               |
| Reading game state | **Polling each frame**, events where they exist                                    | Weather and water have no events, and polling a few numbers costs nothing. Where an event exists, such as `Player.onDeath`, the sound can use it.                                                        |
| Lightning          | **A strike queue** on `LightningController`, drained by the audio each frame       | Thunder needs the exact strike time and position. Polling `boltVisible` can miss chained strikes. A callback would run inside `sky.update`. A queue lets the audio read strikes at its own update point. |
| Parameter changes  | **`setTargetAtTime`** on every `AudioParam`                                        | Writing `.value` each frame makes zipper noise and clicks. A time constant gives smooth changes at any frame rate.                                                                                       |
| Beds               | **2D, no panner**                                                                  | Rain, wind and biome life are all around the player. A panner would make them come from one point.                                                                                                       |
| Player sounds      | **2D, no panner**                                                                  | Footsteps and breathing are at the listener. A panner there gives nothing and costs CPU.                                                                                                                 |
| 3D emitters        | **`PannerNode`, HRTF**, from a fixed pool                                          | HRTF gives above, below and behind. A pool caps the CPU cost and needs no allocation per sound.                                                                                                          |
| Places that sound  | **`Emitter`s with virtual voices**                                                 | A waterfall must still sound when the player comes back. An emitter always exists, but holds a voice only while it can be heard, and takes one again by itself.                                          |
| Far sounds         | **Gain and tone set by the game**, panner only for direction                       | Thunder is 700 to 1,900 m away. The game sets the distance curve. The panner sits 50 m out in the right direction.                                                                                       |
| Under water        | **A low-pass insert** on the world bus, driven by the player                       | One filter makes every world sound muffled. No sound needs its own under-water version. `Player.cameraUnderWater` sets it.                                                                               |
| Logic              | **Pure mapping functions**, unit tested in jest                                    | `windiness → gain` and similar are plain functions. Jest has no Web Audio, so the engine stays a thin layer over them.                                                                                   |
| File format        | **Ogg Vorbis**, 48 kHz                                                             | Chrome and Electron decode it. It is smaller than WAV. The dev server already serves `.ogg`.                                                                                                             |
| Loading            | **Decode every sound**                                                             | Decoded loops join with no gap. See [Decode or stream](#decode-or-stream).                                                                                                                               |
| Start              | **Start the context on the first user gesture**                                    | Chrome blocks audio until the user clicks or presses a key. The first one anywhere, such as **Start** or **Editor**, starts it, so a main menu theme can play too.                                       |
| Engine lifetime    | **One engine for the whole session**                                               | Restart disposes the viewport and its `GameManager`. The engine, its context and its decoded sounds stay. The game and the editor attach to it and detach from it.                                       |

## The audio engine

### Buses

```
                         ┌─▶ ambience ─┐
emitters, beds  ─────────┼─▶ weather  ─┼─▶ world ─▶ under-water low-pass ─▶ menu duck ─┐
                         └─▶ effects  ─┘                                              ├─▶ master ─▶ compressor ─▶ out
player sounds   ──────────▶ player ──────────────────────────────────────────────────┤
music           ──────────▶ music ───────────────────────────────────────────────────┤
UI sounds       ──────────▶ ui ──────────────────────────────────────────────────────┘
```

- **world** holds everything outside the player. Under water, its low-pass falls to about 600 Hz
  and its gain drops. The player's own sounds skip it, so a swim stroke stays clear.
- **Bus ducks.** Ambience, weather and effects each pass through a duck before the world.
  `audio.duckBus(bus, level)` lowers one under a louder sound, apart from its volume, mute and
  solo. Thunder plays on effects and ducks ambience and weather, so it cuts through the rain and
  the wind.
- **menu duck** lowers the world when the in-game menu is open. The game keeps running behind the
  menu, so silence would sound wrong. A duck of about 12 dB is enough.
- **music** skips the world, so music is never muffled under water. Nothing plays on it yet.
- **compressor** is a `DynamicsCompressorNode` that keeps a close thunderclap from clipping.
- Each bus is a `GainNode`. The settings set the master, music, world, player and UI gains. The
  ambience, weather and effects gains are for tuning the mix, through debug commands.

### Beds

A **bed** is one looping sound with a gain and an optional filter. A game value drives it each
frame, through a mapping function.

```ts
interface BedSpec {
  sounds: string[];                    // one name in sounds.json per layer
  bus: BusName;
  filter?: BiquadFilterType;           // for example 'lowpass' to darken light rain
  attack: number;                      // seconds to rise
  release: number;                     // seconds to fall
}

const bed = audio.createBed(spec);
bed.set(gain, cutoff?);                // called each frame; uses setTargetAtTime
bed.setBlend(value);                   // 0 is the first layer, 1 the second, and so on
bed.setRate(rate);                     // playback rate, to raise or lower the pitch
bed.dispose();
```

- A bed whose gain stays at 0 for 3 s, or three times its release if that is longer, **stops its
  sources**. They start again, at a random offset, when its gain rises. So a silent desert bed
  costs nothing in the forest.
- A random start offset stops two beds of the same sound from playing in phase.
- **Layers.** A bed can hold two or three loops, for example light rain and heavy rain. `setBlend`
  moves one value across them with an equal-power crossfade, so the loudness holds steady through
  the fade.
- **Rate.** `setRate` scales every layer's playback rate over the attack, so a loop can rise in
  pitch, as a slide does as it speeds up.
- A layer whose sound has not loaded yet starts on the first `set` after it loads.
- Setting the same gain again adds no automation, so calling `set` every frame costs nothing when
  the value holds still.

### 3D sounds

A **3D sound** plays at a world position, through a `PannerNode` from a pool. Positions,
directions and matrices in the audio API are `Vector3` and `Matrix4` from `rewild-common`, as in the
renderer.

```ts
audio.play('thunder-close', {
  at: strike, // a Vector3 from rewild-common
  delay: 3.2,
  gain: 0.8,
  cutoff: 2500,
});
audio.play('splash-small'); // no position: a 2D player sound
const id = audio.loop('splash-trail', { at: position }); // lasts while its voice does
audio.move(id, position);
audio.stop(id, 0.5); // fade out over 0.5 s
```

- **Voice pool.** 24 voices, each a low-pass, a gain and an HRTF `PannerNode`, built once when
  the context starts. A play creates only its buffer source. When the pool is full, a new sound
  takes the voice heard quietest, or does not play if it would be quieter than all of them.
  "Heard" is the voice's gain times the panner's distance curve from the listener.
- **Return values.** `play` returns whether the sound started. `loop` returns an id for `move` and
  `stop`, or 0. An id goes stale when its sound ends or its voice is taken, and `move` and `stop`
  then return false.
- **Distance.** Panners use the inverse model with a reference distance of 2 m. `rolloff: 0` turns
  the curve off, for far sounds such as thunder whose gain the game sets itself.
- **Movement.** `move` glides the panner over about 20 ms, so a moving sound does not click.
- **A stopping loop** counts as silent, so it is the first voice a new sound takes.
- **Delay** uses the context clock (`ctx.currentTime + delay`). The frame rate does not change it.
  2D sounds take a delay too.
- **Variation.** A manifest entry can list several files and a pitch and gain range. Each play
  picks one at random, so ten footsteps do not sound the same.
- **Priority** multiplies a sound's loudness when voices are ranked, so a sound with a high
  priority is stolen last. Its real gain does not change.

### Emitters that belong to a place

A `loop` lasts only as long as its voice. If a louder sound takes the voice, it is gone. A sound
that belongs to a place, such as a waterfall, the surf or a campfire, is an **emitter** instead.

```ts
const falls = audio.createEmitter({
  sound: 'waterfall',
  at: position,      // a Vector3
  gain: 1,          // optional, like bus, cutoff, rolloff and priority
});
falls.move(position);
falls.set(gain, cutoff?);
falls.dispose();

audio.update();     // once a frame, after the listener moves
```

- **Always there, sometimes playing.** An emitter keeps its sound, position and gain all the time.
  It holds one of the 24 voices only while it can be heard. Otherwise it is **virtual**: silent,
  and costing only a few numbers.
- **Out of earshot.** When its heard gain, its gain times the distance curve, falls below
  -46 dB, it fades out over 0.25 s and gives its voice back. Nothing has to steal it.
- **Back in earshot.** `audio.update()` checks every emitter. A virtual one heard above -40 dB
  takes a free voice, or the quietest one if it beats it. It starts at a random point in its loop
  and fades in over 0.25 s, so the gap does not show. The 6 dB between the two levels stops an
  emitter at the edge from flickering on and off.
- **Stolen.** If a louder sound takes its voice, the emitter goes virtual and takes a voice again
  as soon as one is free or quieter.
- **Owners do not track voices.** A system creates its emitters, moves them and disposes them. It
  never checks whether one is playing.
- **The bus** is ambience unless the spec says otherwise.
- `set(0)` sends an emitter virtual on the next update, which turns it off without disposing it.

Use a bed for a sound with no place, such as rain. Use an emitter for a sound that comes from a
place. Use `play` or `loop` for short sounds that do not need to come back.

### The listener

Each frame `GameManager` calls `audio.setListenerFromMatrix(camera.transform.matrixWorld)`
after the renderer. It takes the position from `m[12..14]`, forward from `(-m[8], -m[9], -m[10])`
and up from `(m[4], m[5], m[6])`, the same as `SkyRenderer` and `WaterLens`. The listener's
parameters glide over about 20 ms, as emitters do. A listener set before the context exists is
applied when it starts.

### The sound manifest

`templates/sounds.json` lists every sound. The files live in `assets/shared/audio/` and load
through `resolveAssetUrl`, the same as textures. They go to the bucket with `npm run assets:push`
and come back with `npm run assets:pull`, like every other shared asset.

```json
{
  "sounds": [
    {
      "name": "wind-air",
      "files": ["audio/wind/air-01.ogg"],
      "loop": true,
      "source": "Soundly: Wind Gentle Pine Forest 01",
      "license": "soundly"
    },
    {
      "name": "footstep-grass",
      "files": [
        "audio/steps/grass-01.ogg",
        "audio/steps/grass-02.ogg",
        "audio/steps/grass-03.ogg"
      ],
      "pitch": [0.92, 1.08],
      "gain": [0.8, 1]
    },
    {
      "name": "thunder-close",
      "files": ["audio/thunder/close-01.ogg", "audio/thunder/close-02.ogg"]
    }
  ]
}
```

A `SoundBank` holds the manifest's sounds. `Application` fetches the manifest when the app loads,
and the bank starts downloading every file at once. The files decode as soon as the
`AudioContext` exists, so by the time a game or the editor has loaded they are ready. A decoded
buffer outlives its context, so each file decodes once per session. Beds for climates the world
does not use are not loaded. An arid world never loads the forest bed.

- **A failed file** logs one error naming the sound and the URL. The sound plays its other files.
  A sound with no loaded files does not play. Nothing throws.
- **Variation.** Each play picks a file at random, never the one it played last, and a pitch and
  gain from the entry's ranges. Both default to 1.

#### Sources and licences

The sounds come from Soundly. Every entry has a `source` and a `license`:

- **`source`** is the original file name in Soundly, so the sound can be found again.
- **`license`** is `"soundly"` for a sound from Soundly's own library or a partner library. For a
  Freesound result found through Soundly, it is that sound's own licence, such as `"CC0"` or
  `"CC-BY-4.0"`, and `source` also names the author. A sound made for the game is `"own"`.
- A CC-BY sound needs a credit in the game.
- A non-commercial licence, such as CC-BY-NC, is not allowed.
- Soundly's licence allows the sounds in a game but not passing them on as sound effects. The
  bucket holds only the game's own Ogg encodes, trimmed, looped and mixed for the game. Each file
  is public, like every other asset, but the bucket cannot be listed.

### Scopes

A **scope** is a group of sounds that end together, such as one game session.

```ts
const sound = audio.createScope();
sound.play('splash-small');
sound.loop('engine', { at: position });
sound.createBed(spec);
sound.createEmitter(spec);
sound.dispose(); // fades out and stops everything above over 0.3 s
```

- Disposing a scope stops its 2D one-shots, its 3D sounds and loops, its beds and its emitters.
  Sounds outside it, such as a menu theme, carry on.
- A disposed scope plays nothing, so a late call from a system that is shutting down is harmless.
- Beds and emitters also take a fade on their own `dispose(fade)`.
- Each `GameManager` opens a **scene scope** for its game and closes it when it is disposed.
  `sceneScope()` in `src/core/audio/audio.ts` returns the running game's scope, or null.

### Silencing

`audio.setSilenced(reason, on)` silences the master for a named reason. The master is silent while
any reason holds, and the mixer's own volumes and mutes are untouched, so nothing undoes anything
else.

| Reason         | Set by                                       |
| -------------- | -------------------------------------------- |
| `'background'` | The window losing focus, with the setting on |
| `'editor'`     | The editor's sound toggle being off          |

`audio()` lists the reasons in force.

### Start, focus and pause

- **Start.** `Application` calls `audio.startOnGesture(document)`. The first click, tap or key
  press anywhere creates the `AudioContext`. On the main menu that is usually **Start** or
  **Editor**. A gesture the browser does not accept leaves the context suspended, and the next one
  tries again.
- **Restart.** The engine stays. The old game's scene scope fades out, and the new game opens its
  own. The decoded sounds are kept, so a restart loads nothing.
- **Quit.** Leaving the game for the main menu fades out the game's scene scope and lifts the
  menu duck. The engine keeps running, so the menu can have its own sound.
- **Menu.** Opening the in-game menu, with Escape or by losing pointer lock, ducks the world bus.
  **Resume** lifts it. The settings panel opened from the menu keeps the duck. The Game Over menu
  does not duck.
- **Hidden window.** `Application` calls `audio.suspendWhenHidden(document, () => audioSettings.muteInBackground)`. On `visibilitychange` to hidden, the engine suspends the
  context if the setting is on. It resumes when the window shows again.
- **Lost focus.** While **Mute when in the background** is on, the master fades out on `blur`.
  With it off, the game keeps playing on `blur` and in a hidden tab. This matters most in
  Electron.

## Weather sound

### Wind

Wind is the most important sound in an outdoor game. `WindSound` in `src/core/audio/` plays it in
every biome, from the sky's `WindState`: `vec[2]` is the windiness in force and `vec[0..1]` the
way the air moves.

| Layer     | Sound                                    | Driven by                                                                       |
| --------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| **Air**   | A bed of three loops, calm to windy      | `windiness` picks the blend and opens the low-pass. A gust swells it.           |
| **Ears**  | A rough roar, as when facing into a gale | `windBlurShare(windiness, 0.8) × windFacing × gust envelope`, as the lens blur. |
| **Gusts** | One-shot swells                          | The gust at the listener surging past a threshold.                              |

- **The air bed.** Each loop plays alone at the windiness it was cut for, 0.1, 0.45 and 0.8
  (`AIR_LAYER_AT`), with an equal-power crossfade between. Calm and fair weather sit at 0.05 to
  0.2, so the calm loop is the one heard most. Its gain is the windiness, from silent in still air
  to full in a gale, and its low-pass opens from 1.5 kHz to 18 kHz, so a gale is harsh.
- **Gusts.** `gustShare(gustField(x, z, wind.gustDrift))` at the listener gives the gust value.
  It is the same gust field that bends the trees and pushes the player, so a gust is heard, seen
  and felt at the same time. It swells the air bed by up to 35% in strong wind.
- **Gust one-shots.** When the gust value rises past 0.5, a gust one-shot plays 15 m upwind. It
  plays again only after the gust has fallen below 0.3 and at least 3 s have passed, so a long
  gust is one swell. Its gain rises with the windiness from 0.25, and it is silent below that.
- **Facing into the wind.** The ears layer uses the same `windFacing` value and `followGust`
  envelope as the lens blur in `WaterLens`. Turn into a gale and the screen blurs and the roar
  rises together. Turn your back and both drop. It starts at windiness 0.8, as the blur does.
- **Direction.** The ears layer is an emitter 10 m upwind of the listener, moved each frame, so
  the gale comes from where the wind comes from. It has no distance curve (`rolloff: 0`), because
  its gain is set by the wind, not by distance. Below the gale its gain is 0, so it holds no voice.
- **Bursts.** A storm's wind bursts already swing `windiness` and the bearing. The layers follow
  them with no extra work.

What the wind does to the place is biome sound, not weather sound. Leaves in a forest, grass on a
plain and a whistle over a ridge are rules in each biome's soundscape. See
[Soundscapes](#soundscapes).

### The world's sound

`WorldSound` in `src/core/audio/` holds the sound of the world around the listener: the wind now,
and the rain, thunder, water and land as their steps arrive. `GameManager` and `EditorSound` each
create one in their scene scope and call `update(renderer, seconds)` once a frame, before
`audio.update()`. It reads the listener's position, so it works in the editor too.

### Rain and snow

`RainSound` in `src/core/audio/` plays it, as part of `WorldSound`.

| Layer     | Sound                           | Driven by                                                           |
| --------- | ------------------------------- | ------------------------------------------------------------------- |
| **Rain**  | Light rain and heavy rain loops | `rainShare(precipitation, temperature)`. Crossfades light to heavy. |
| **Drips** | Slow drips after the rain       | `rainWetness.film` while the rain is light. The world drips dry.    |
| **Snow**  | Almost silence                  | The base profile's `snow-dampens` rule muffles every biome layer.   |

- **The rain bed.** Its gain rises with `rainShare` and is full from 0.4, the strength at which
  the world is fully wet. The light loop crossfades into the heavy one from 0.25 to 0.7. Its
  low-pass opens from 5 kHz in a drizzle to 20 kHz in a downpour.
- **Drips.** The drips bed follows the wet film on the world, which runs off over about a minute
  after the rain. Rain above 0.15 hides the drips.
- **Snow.** `rainShare` falls to 0 as `temperature` falls to 0, so the rain bed falls silent in
  snow by itself. At `temperature` 0.25, half snow, it plays at half strength.

- Rain on leaves, on sand or on rock is biome sound. A forest adds canopy rain with a rule.
- Rain on open water could be its own layer later. In Phase 2, the rain bed covers it.
- Rain never runs ahead of the clouds in the weather system, so rain sound never starts from a
  clear sky.

### Thunder

`LightningController.beginStrike` places each strike 700 to 1,900 m away, within 45° of the
camera's forward. Its **strike queue**, `LightningController.strikes`, is a `StrikeQueue` in
the sky renderer.

- **`beginStrike` pushes** a record: the strike position, the index in a chain, and the time of
  the strike, in seconds on the queue's clock (`performance.now()`).
- **`ThunderSound` pops** every record in the queue each frame, oldest first, and plays the
  thunder for each. `WorldSound` owns it, so it runs in the game and in the editor.
- **A fixed ring buffer** of 8 records holds the queue. The records are reused, so a strike
  allocates nothing.
- **When the buffer is full**, a new strike replaces the oldest one. Nothing drains the queue while
  the sound is off, so it never grows past 8. When the sound comes back on, the audio drops a
  record whose thunder arrived more than 1 s ago.
- **One reader.** The audio is the only reader, so it pops. If another system needs strikes later,
  each reader keeps its own read position in the buffer instead.

On each strike:

1. Find the distance `d` across the ground from the listener to the strike.
2. Delay the sound by `d / 343` seconds from the strike's own time, less the time since it. At
   700 m that is 2 s, at 1,900 m it is 5.5 s. The player sees the flash, then counts to the
   thunder. A late pop does not make late thunder.
3. Pick the sound by distance: a **crack and rumble** (`thunder-close`) below 1 km, a
   **rumble** (`thunder-far`) above.
4. Set the gain and the low-pass cutoff from `d`. Far thunder is quieter and deeper: the gain is
   2.5 to 700 m and falls as `2.5 × (700 / d)^0.8`, to about 1.1 at 1,900 m. The cutoff falls from
   9 kHz at 700 m to 1.2 kHz at 1,900 m. Thunder is the loudest thing in the world, so its gain
   goes above 1, and the master compressor keeps it from clipping.
5. Play it on a panner 50 m out in the strike's direction, so the direction is correct but the
   game owns the distance curve.

**Chains.** A chained strike 50 to 200 ms later plays a shorter crack only (`thunder-chain`), as
loud as the first. Its rumble is already in the first one.

**The duck.** Thunder plays on the effects bus. As each one arrives, it ducks the weather and
ambience buses, so the rain, the wind and the land drop away under it. The nearest thunder ducks
them by 12 dB, and far thunder by less, in step with its gain. The duck holds while the thunder
sounds, 3 s for a close one, 4 s for a far one and 0.8 s for a chained crack, then lets go by e
every 1.5 s. When thunders overlap, the deepest duck wins.

**Distant storms.** While the weather is in `FrontApproaching`, a low rumble with no bolt plays
every 30 to 90 s, from upwind, where the storm is. It is `thunder-far` at a low gain, with its
cutoff at 500 Hz.

**Manual strikes.** `triggerLightning` in the console also goes through `beginStrike`, so it
pushes to the queue and thunder can be tested on demand. A manual strike is never a chained one.

## The player

`PlayerSounds` in `src/core/audio/` holds every player sound: `Footsteps`, `BodySound`,
`SlideSound`, `SwimSound`, `DripSound` and `UnderWaterSound`, and later the voice. `Player` creates one on
mount, in the game's scope, and disposes it on unmount.

- **State.** Each frame `Player` fills in `sounds.state`, one reused object: where the feet are,
  the distance moved, the ground contact, the slide speed, the fall, the water, the keys held and
  the ground's wetness. Then it calls `sounds.update(seconds)`.
- **Events.** A jump and the flashlight are calls of their own: `sounds.jump()` and
  `sounds.flashlight()`.
- **Its own decisions.** `PlayerSounds` works out the rest from the state, such as a landing
  from the ground contact changing, and whether a slide stops the steps. So `Player` holds no
  sound logic.

The player sounds play on the player bus, in 2D. The editor has no player, so it has none of
these sounds.

### Under water

`UnderWaterSound` in `src/core/audio/`, held by `PlayerSounds`, plays it. `Player.cameraUnderWater`
switches the mix. The camera is the player's eye.

- The world bus low-pass falls to 600 Hz over 0.1 s and its gain halves.
- An **under-water bed** (`under-water`) fades in: a low hum and the sound of moving water. It
  plays on the player bus, so the muffle does not dull it twice.
- **The splashes** play on the effects bus, in the world. A surfacing splash still ringing when a
  wave takes the head under again goes dull with everything else, and a plunge's tail goes dull
  as the head goes under.
- Thunder still plays, very deep and soft, through the low-pass.
- Disposing the sound, as the player unmounts on a restart or a quit, lifts the muffle.

**Going in.** A plunge when the feet first touch the water, from `verticalVelocity` before the
water slows it. Speeds are in its units, in which a jump on flat ground lands at about 10.5 and a
fall hurts from 15. Below 2, as when wading in, there is none. A step off a ledge or a jump makes a
small plunge (`plunge-small`). From 14, a fall from well above a jump, into water at least 1.5 m
deep, it is a big one (`plunge-big`). Its gain rises with the speed from 0.4 to 1 by 20, and falls
to 0.4 of that into the shallowest water.

**Coming out.** A splash (`surface`) when the camera leaves the water after at least 0.5 s under,
so a wave over the eye does not splash. The gasp from the voice comes with
[Breath and voice](#breath-and-voice). The lens drops begin at the same time in `WaterLens`.

### Swimming and wading

| State        | Read from                       | Sound                                           |
| ------------ | ------------------------------- | ----------------------------------------------- |
| **Wading**   | `immersion`, `wadeSpeedShare`   | Footsteps become splashes as the water deepens. |
| **Swimming** | `swimming` and movement         | A stroke every 0.9 s or so while moving.        |
| **Diving**   | `cameraUnderWater` and movement | Slower, muffled strokes and bubbles.            |
| **Floating** | `swimming`, no movement         | Water lapping at the head, from wave height.    |

- `SwimSound` in `src/core/audio/` plays the strokes. Moving is any movement key, diving, or rising
  under water. The first stroke comes 0.15 s after the swimmer starts to move.
- **Strokes.** `swim-stroke` every 0.9 s at the surface, 0.65 s sprinting. Under water,
  `swim-stroke-under` every 1.3 s, 1 s sprinting, and four strokes in ten let out
  `swim-bubbles`.
- Every stroke plays on the player bus, so the world muffle does not dull it. The under-water
  strokes are muffled in the recording.
- The bubbles are in the water around the head, so they play on the effects bus, like the
  splashes, and go dull with the world's under-water muffle.
- **Emerging.** When a swimmer finds their feet and stands, `swim-emerge` plays once: the body
  rising out of the water. It plays whether or not they were moving.
- **Dripping.** `DripSound` in `src/core/audio/` drips water off the player after a swim.
  Swimming soaks the body through; wading does not. Out of the water the `body-drips` bed plays at
  the soak, which falls by e every 4 s as the body dries, so a swimmer drips for about ten seconds
  after their feet leave the water. It is silent while the player is still in the water.

### The body

| Event            | Read from                                     | Sound                                     |
| ---------------- | --------------------------------------------- | ----------------------------------------- |
| **Jump**         | `jumpRequested` when it is accepted           | A soft push off.                          |
| **Landing**      | `_onGround` false to true, `verticalVelocity` | A thud that gets heavier with fall speed. |
| **Hard landing** | the fall damage at `verticalVelocity < -15`   | A heavy thud and a grunt.                 |
| **Flashlight**   | the F key                                     | A click.                                  |

- A landing also plays a footstep on the surface below, so a jump onto snow sounds like snow.
  The next step comes half a stride later.
- A landing is `_onGround` changing from false to true. It is not `grounded`, because `grounded`
  also changes when the player moves from steep ground to walkable ground with no fall.
- **Sizes.** Fall speeds are in `verticalVelocity`'s units, in which a jump on flat ground lands at
  about 10.5. Below 3, as off a bump, there is no landing. From 3 the `land` thud rises in gain
  from 0.3 to full at 15. A landing that does fall damage plays `land-hard` at full gain instead.
  Its grunt is the voice's pain, in [Breath and voice](#breath-and-voice).
- **Into water.** Touching down with water over the feet plays no landing. The plunge covers it.
- `BodySound` in `src/core/audio/` plays the jump, the landings and the click. The flashlight
  clicks when it turns on and off.

### Death

When `health` reaches 0, `Player._die()` stops the player, calls `onDeath` and releases pointer
lock. `InGame` then opens the **Game Over** menu. Its **Restart** disposes the viewport and builds
a new one.

- **The sound.** `_die()` plays a one-shot death sound on the player bus. If a fall caused the
  death, the hard landing plays first and the death sound follows it.
- **The mix.** The world bus fades and its low-pass falls over about 2 s, so the world goes
  distant and dull. It is the same filter as under water, with a slower curve. The player bus
  stops, so the heartbeat and breathing end.
- **The Game Over menu.** The world stays faded behind it. It does not take the in-game menu's
  duck as well.
- **Restart.** The old game's sounds stop. The new game lifts the world bus over about 1 s as it
  starts.

### Breath and voice

The player's breath and voice tell them how their body is doing: out of breath after a sprint,
gasping after a long dive, panting in the desert sun, shivering in snow, hurt after a fall.

Only `health` and `hunger` exist as player stats today. So the voice reads the world and the
movement, and keeps a few values of its own. If gameplay adds stamina, oxygen or body heat later,
those stats replace the voice's own values and the sounds stay the same.

#### Body values

| Value        | Range    | How it is worked out                                                                               |
| ------------ | -------- | -------------------------------------------------------------------------------------------------- |
| `effort`     | 0 to 1   | Rises while sprinting, swimming fast or walking into a gale (`headwindSpeedShare`). Falls at rest. |
| `breathHeld` | seconds  | Time with the camera under water. Back to 0 on surfacing.                                          |
| `heat`       | 0 to 1   | `temperature`, the sun height, a hot biome such as desert, and `effort`. Shade does not count.     |
| `cold`       | 0 to 1   | Low `temperature`, `snow`, wind on the player, and being wet from swimming or rain.                |
| `health`     | 0 to 100 | `Player.health`                                                                                    |
| `hurt`       | 0 to 1   | Jumps up by the damage taken when `health` falls, then fades over a few seconds.                   |
| `hunger`     | 0 to 100 | `Player.hunger`                                                                                    |

These are signals, so the voice uses the same `RuleSet` as the soundscapes and the footsteps.

#### One mouth

The player has one mouth. Breath and voice sounds never overlap. The voice plays one thing at a
time, by priority:

1. **Death.**
2. **Pain.** A grunt when `health` falls. A small hurt makes a small grunt, a big one a cry.
3. **Gasp.** On surfacing. The longer `breathHeld`, the bigger the gasp and the more breaths after it.
4. **Strain.** Under water, after about 20 s of `breathHeld`. Muffled straining and a burst of
   bubbles.
5. **Breathing.** A loop chosen by rules. See below.

A higher sound cuts in over a lower one with a short fade. The lower one comes back after.

#### Breathing rules

| Condition              | Sound                                                                           |
| ---------------------- | ------------------------------------------------------------------------------- |
| `effort` rises         | Calm breathing becomes hard breathing, then panting.                            |
| `swimming` and moving  | A breath in time with each stroke, harder as `effort` rises.                    |
| `heat` above about 0.6 | Slow, dry panting. It adds to the effort breathing.                             |
| `cold` above about 0.6 | Shaky breath and chattering teeth, now and then.                                |
| `health` below 25      | Heavy, pained breathing, and a heartbeat loop that gets louder as health falls. |
| `hunger` below 20      | A stomach growl now and then.                                                   |

- The heartbeat is on the player bus, so it stays clear under water and through the death fade.
- At low health, a small `muffle` on the world bus pulls the world away a little.
- Calm breathing is very quiet. The player should notice it only when it changes.

### Sliding

The player slides down slopes that are too steep to stand on, and can slide off a cliff edge.
`GroundSlide` (`src/core/routing/utils/Sliding.ts`) reads the ground normal under the player each
frame and keeps a slide velocity:

- From `SLIDE_START` (35°) the ground pulls the player downhill. From `SLIDE_FULL` (45°) the full
  share of gravity pulls. The slide stops at `SLIDE_MAX_SPEED` (14 m/s).
- On steep ground the player cannot walk uphill. `uphillCancel` takes the uphill part out of the
  walking input.
- On gentler ground the slide slows down by `SLIDE_FRICTION`. In the air it carries on.
- **A fast slide hurts.** Snapping holds the player to slopes up to 70°, so a slide down a steep
  face never builds up `verticalVelocity` and takes no fall damage at the bottom. Instead, sliding
  on the ground faster than `SLIDE_HURT_FROM` (9) takes health every second, rising to
  `SLIDE_HURT_RATE` (20 a second) at `SLIDE_MAX_SPEED`. A slide only reaches that speed on slopes
  of about 43° and steeper, so slides on gentler ground are safe, and a long slide down a steep
  mountain face kills. `slideDamage` in `Sliding.ts` works it out. A slide off a cliff still
  takes the fall damage of its landing.
- **Obstacles stop a slide.** After the character controller resolves a move, `GroundSlide.collide`
  compares the move asked for with the move allowed. The difference is the way an obstacle, such
  as a rock, blocked the player, and the slide and skid velocity into it are lost, as in a dead
  stop. The velocity along the obstacle carries on, so a glancing hit keeps sliding. A slide
  stopped by a rock cannot throw the player on once they step clear of it.
- **Hitting an obstacle hurts.** The slide speed lost into it is the impact. Above
  `IMPACT_HURT_FROM` (6) each unit takes `IMPACT_HURT_SCALE` (5) health, so a rock hit at full
  slide speed takes 40, and `land-hard` plays. It hurts on any ground, slippery or not. Walking or
  skidding into something never hurts; only the slide counts.
- **Slippery ground.** Each terrain material has a `slip`, 0 for full grip to 1 for ice, in
  `TerrainMaterials.ts`. The mountain snow, `snow_field_aerial`, is 1. A material without one has
  grip, and a new one such as mud sets its own. `TerrainRenderer.sampleSlip(x, z)` weights each
  material's slip by its splat under the feet, and `Player` passes it to the slide each frame. On
  slippery ground:
  - A slide starts on gentler slopes, from 15° on ice in place of 35°, so on ice most slopes pull
    the player downhill and a 30° slope is hard to climb.
  - A slide bleeds off slower on gentle ground, with 97% less friction on ice, so it barely slows
    past the bottom of a slope.
  - Walking skids. The walking velocity catches up with the keys by e every `slip / 0.8`
    seconds, so on ice it takes over a second to get going, stop or turn, and the player drifts
    on for a couple of seconds after letting go. On ground with grip
    it follows the keys at once, and in the air it always does. The uphill cancel acts after the
    skid, so a skid cannot carry the player up a slope too steep to climb.
  - A slide does no harm: its damage scales by `1 − slip`. What it carries the player into still
    hurts. A slide off ice onto rock hurts as soon as the rock is underfoot, and one off a cliff
    takes the fall damage of its landing.
- `GroundSlide.climbing` says when the last step held back walking input that pushed up a sliding
  slope.
- `Player.grounded` is false on ground steeper than `MAX_SLOPE_CLIMB` (45°), even when the player
  stands on it. The real contact is the private `_onGround`.

`SlideSound` in `src/core/audio/`, held by `PlayerSounds`, plays it. `Player` passes the slide in
its state: the slide velocity, the feet's height and whether the walking input is `climbing`.

- **Slide speed**: the length of the slide velocity, in the slide's units of half a metre a
  second.
- **Sliding**: on the ground with a slide speed above 0.5 (`SLIDING_FROM`), about 1 m/s. A slide
  in the air makes no sound.
- **Steep**: on the ground and not `grounded`. The player is on ground too steep to climb.

A slide sounds like the ground giving way: crumbling dirt, grit and loose stones moving under the
player. It is the same on every surface except snow, which hisses and crunches instead. A surface
in `footsteps.json` can name its own `slide` loop. One that does not uses `slide-crumble`:

```json
"snow": { "sound": "step-snow", "slide": "slide-snow", "tags": ["soft"] }
```

- **The loop.** While sliding, the slide loop plays on the player bus. From the slowest slide to
  the fastest, its gain rises from 0.35 to 1, its rate from 0.85 to 1.2 and its low-pass opens
  from 1.5 kHz to 14 kHz, so a fast slide crumbles harder, higher and harsher. It fades out when
  the slide stops. Each slide sound is its own bed, set by the share of its surfaces under the
  feet from `Footsteps.weigh`, so a slide from snow onto rock crossfades.
- **The slip.** `slide-slip` plays when a slide starts: the ground breaking away under the feet.
  A slide that starts again within 0.5 s of stopping does not slip again.
- **Falling debris.** Dirt and stones break loose ahead of the player. `slide-debris-crumble` or
  `slide-debris-stones` plays in 3D on the effects bus, 3 to 10 m downhill along the slide, on the
  terrain there. The first comes 0.2 s into a slide, then every 0.6 s for the slowest slide down
  to 0.2 s for the fastest, give or take a quarter. Their gain rises with the speed.
- **Over the edge.** A slide faster than 2 that leaves the ground, other than by a jump, plays both
  debris sounds at full gain from the edge. The player falls in silence and plays the landing as
  normal.
- **Scrabbling.** While on steep ground and `climbing`, `slide-scrabble` plays at once and then
  every 0.25 to 0.45 s: feet that cannot get a grip. They stop when the player stops pushing.
- **The end.** When the slide stops, the steps start again with no gap.
- Footsteps do not play while sliding.

### Footsteps

Footsteps have two kinds of input:

- **The ground under the foot.** Snow on a mountain is where the snow material is, from height and
  slope. Sand is where the beach material is. This is local, and the terrain already knows it.
- **What is true everywhere.** Wading in water, wet ground after rain, speed and crouching. These
  change any surface in the same way.

So `Footsteps` uses the ground material for the first and rules for the second. The
rules are the same `RuleSet` as the soundscapes.

#### When a step plays

- The player takes a step every stride moved across the ground, not every so many seconds. A
  sprint is only a speed multiplier, so it gives faster steps by itself. A crouch gives slower
  ones.
- The stride lengthens with speed, from 2.1 m at 3 m/s to 4.7 m at 15 m/s, as a runner's does.
  The player is about twice human size and walks at about 6 m/s, so a walk is about two steps a
  second, a sprint about three and a crouch under one and a half.
- From rest, the first step comes after about half a stride.
- **Layers.** A step plays each layer with a gain as its own one-shot, all at once. The wet and
  the splash are layers over the ground step, so their files hold only the squelch or the splash,
  with no footfall of their own.
- Steps play only while `grounded`, not sliding and not `swimming`. A swimmer makes strokes, not
  steps. On steep ground `grounded` is false, so steps stop there by themselves.
- `Footsteps` works out the sound once for each step, not each frame. Each step plays on the
  player bus, in 2D.

#### The ground material

`TerrainRenderer.sampleSplat(x, z, out)` reads the splat weights under the foot from
`TerrainChunk.splatData`, blended between texels. That data is on the main thread already, and it
includes painted edits. The weights are over `TerrainRenderer.splatPalette`, the climate's
material palette.

`templates/footsteps.json` maps each material to a **surface**:

```json
{
  "materials": {
    "snow_field_aerial": "snow",
    "aerial_grass_rock": "grass",
    "grass_path_02_1k": "grass",
    "forest_leaves_02": "leaves",
    "forest_leaves_03_1k": "leaves",
    "sand_01": "sand",
    "aerial_beach_01": "sand",
    "aerial_beach_02": "sand",
    "mud_cracked_dry_03": "dirt",
    "aerial_rocks_01": "rock",
    "marble_cliff_05": "rock",
    "cliff_side_1k": "rock",
    "tiger_rock_1k": "rock"
  },
  "surfaces": {
    "grass": { "sound": "step-grass", "tags": ["soft"] },
    "leaves": { "sound": "step-leaves", "tags": ["soft"] },
    "snow": { "sound": "step-snow", "tags": ["soft"] },
    "sand": { "sound": "step-sand", "tags": ["soft"] },
    "dirt": { "sound": "step-dirt", "tags": ["soft"] },
    "rock": { "sound": "step-rock", "tags": ["hard"] }
  },
  "fallback": "dirt",
  "rules": [
    {
      "id": "wet-ground",
      "when": { "wetness": [0.2, 0.7] },
      "add": "step-wet",
      "gain": 0.3,
      "tags": ["ground"]
    },
    {
      "id": "wade",
      "when": { "immersion": [0.05, 0.4] },
      "add": "step-splash"
    },
    {
      "id": "wade-deep",
      "when": { "immersion": [0.3, 0.9] },
      "scale": "#ground",
      "by": 0
    },
    { "id": "sprint", "when": { "speed": [7, 14] }, "scale": "*", "by": 1.4 },
    { "id": "crouch", "when": { "crouching": [0, 1] }, "scale": "*", "by": 0.4 }
  ]
}
```

- **Blends.** Where two materials meet, the weights of their surfaces add. The strongest surface
  plays at full gain. A second surface plays as well if its weight is 0.3 or more, at its weight
  over the strongest's. So patchy snow over rock sounds like both.
- **Tags.** Each surface layer also has the tag `ground`, so a rule can act on whatever the ground
  is.
- **A material not in the map** uses `fallback`. A new material is never silent. Ground with no
  splat yet, or no terrain, uses it too.
- **Wet ground.** The wet layer has the `ground` tag, so deep water silences it with the ground.
- **Wading.** As `immersion` rises, a splash joins the step. In deeper water, the splash replaces
  it.
- **Checks.** `Footsteps` throws on a `fallback` or a material that names no surface, and on a bad
  rule. The player then logs the error and has no footsteps.

#### Player signals

The footstep rules read these signals:

| Signal      | Range  | From                                                  |
| ----------- | ------ | ----------------------------------------------------- |
| `wetness`   | 0 to 1 | `rainWetness.soak`, which lingers long after the rain |
| `immersion` | metres | `Player.immersion`                                    |
| `speed`     | m/s    | The distance the player moved across the ground       |
| `crouching` | 0 or 1 | `Player._crouching`                                   |

A sprint has no signal of its own. It raises `speed`, and the `sprint` rule follows `speed`. Speed
is in real metres a second: a walk is about 6 and a sprint about 15.

## The land

### Surf and lapping

Surf and lapping are world sounds, read at the listener, so they play in the editor too.

- **Ocean surf.** An emitter on the nearest shore point from `ShoreField`, moved as the listener
  walks, so the surf comes from the beach. Its gain follows the sea state from `windiness`. A calm
  sea is a soft wash. A storm sea is a heavy crash.
- **Lake lapping.** Quieter and shorter. It follows the lake's `lapping` value from the water
  palette.
- `WaterQuery.sample` gives the water's kind through `typeWeights`, so ocean and lake can blend at
  a lagoon.

### Where the player is

There is no runtime biome query at the player today. The editor's `PositionReadout` has one. It
calls `resolveBiomeWeights` every 200 ms. This milestone moves that logic to a shared
**`BiomeProbe`** that both use. The probe uses `resolveActiveBiomes`, so painted biomes count.

The probe gives weights that sum to 1. Each biome's soundscape plays at its weight. So walking from
a plain into a forest crossfades the sound as the ground changes.

### Soundscapes

The weather changes how a place sounds. A calm forest has birdsong and soft leaves. In a gale the
leaves roar, branches creak and the birds go quiet. In the rain, drops patter on the canopy. A
soundscape says this as data.

Each biome has a **soundscape profile** in `templates/soundscapes.json`. A profile has:

- **Layers.** The beds that make the place, for example leaves, day birds and night insects.
  A layer can have **tags**, such as `wildlife` or `birds`.
- **Rules.** Changes to the layers when a condition is true: **add** a layer, **replace** a layer,
  **scale** a layer or **muffle** a layer.
- **Calls.** One-shot wildlife calls in 3D. See [Wildlife calls in 3D](#wildlife-calls-in-3d).

The profiles stay in `templates/soundscapes.json`, keyed by biome name. They do not go on
`BiomeParams` in `Biomes.ts`. That file is in the renderer, and the renderer knows nothing about
sound.

```json
{
  "*": {
    "rules": [
      {
        "id": "rain-quiets-wildlife",
        "when": { "rain": [0.1, 0.5] },
        "scale": "#wildlife",
        "by": 0.2
      },
      {
        "id": "gale-quiets-wildlife",
        "when": { "windiness": [0.7, 1.0] },
        "scale": "#wildlife",
        "by": 0.3
      },
      {
        "id": "storm-silences-wildlife",
        "when": { "state": "Storm" },
        "scale": "#wildlife",
        "by": 0
      },
      {
        "id": "birds-after-rain",
        "when": { "state": "Clearing" },
        "scale": "#birds",
        "by": 1.3
      },
      {
        "id": "dawn-chorus",
        "when": { "dawn": [0, 1] },
        "scale": "#birds",
        "by": 1.6
      },
      {
        "id": "snow-dampens",
        "when": { "snow": [0.2, 0.8] },
        "muffle": "*",
        "cutoff": 2500
      },
      {
        "id": "fog-dulls",
        "when": { "fog": [0.4, 1.0] },
        "muffle": "#far",
        "cutoff": 4000
      }
    ]
  },
  "forest": {
    "layers": [
      { "id": "leaves", "sound": "forest-leaves-calm" },
      {
        "id": "birds",
        "sound": "forest-birds-day",
        "tags": ["wildlife", "birds", "far"],
        "when": { "sun": [-0.1, 0.2] }
      },
      {
        "id": "night",
        "sound": "forest-night",
        "tags": ["wildlife", "far"],
        "when": { "sun": [0.1, -0.2] }
      }
    ],
    "rules": [
      {
        "when": { "windiness": [0.4, 0.8] },
        "replace": "leaves",
        "with": "forest-leaves-gale"
      },
      { "when": { "windiness": [0.6, 1.0] }, "add": "forest-creak" },
      { "when": { "rain": [0.05, 0.4] }, "add": "forest-canopy-rain" }
    ]
  }
}
```

#### The base profile

The `"*"` profile holds the rules that most biomes share. Every biome profile extends it, so
"wildlife goes quiet in the rain" is written once.

- **Tags.** Base rules target tags, not layer ids, because the base knows no biome's layers. A
  target that starts with `#` is a tag, such as `"#wildlife"`. `"*"` is every layer.
- **Order.** The base rules apply first, then the biome's own rules.
- **Opting out.** A base rule has an `id`. A biome can turn it off with
  `"without": ["gale-quiets-wildlife"]`. For example, the desert keeps its cicadas in wind.
- **No base layers.** The base has rules and calls, but no layers. Each biome owns all of its
  sound.

#### Conditions

A condition gives a **weight from 0 to 1**, not true or false. So every rule fades in and out with
the weather.

- **A range** `[from, to]` on a signal. The weight is 0 at `from` and 1 at `to`, eased between. If
  `from` is above `to`, the weight rises as the signal falls. `"sun": [0.1, -0.2]` is "night".
- **A state** `"state": "Storm"`. The weight eases from 0 to 1 over a few seconds after the weather
  enters the state, and back after it leaves. A state change is sudden, so it needs this ease.
- **More than one** condition in a `when`: the weights multiply. All must be true for the full
  effect.
- A layer's own `when` uses the same form. So day and night are conditions too, and need no special
  case.

Ranges are the normal choice. The knobs ease and wander inside a state, so a range follows the
weather as it moves. A state is for the kind of weather, for example "birds are silent in a storm".

#### Signals

The soundscape reads these each frame. They come from the listener's position, so they work in the
editor too:

| Signal       | Range      | From                                                      |
| ------------ | ---------- | --------------------------------------------------------- |
| `windiness`  | 0 to 1     | `SkyRenderer.windiness`                                   |
| `gust`       | 0 to 1     | `gustShare(gustField(...))` at the player                 |
| `rain`       | 0 to 1     | `rainShare(precipitation, temperature) × precipitation`   |
| `snow`       | 0 to 1     | The snow share of `precipitation`                         |
| `wetness`    | 0 to 1     | `rainWetness`, so the world can drip after the rain       |
| `fog`        | 0 to 1     | `foginess`                                                |
| `cloudiness` | 0 to 1     | `cloudiness`                                              |
| `sun`        | -1 to 1    | `skyRenderer.upDot`                                       |
| `dawn`       | 0 or 1     | `isDawn`, eased                                           |
| `moon`       | 0 to 1     | `moonIllumination(phase)` while the moon is the key light |
| `state`      | a state id | `atmosphere.state`, eased per state                       |

#### Actions

| Action    | Effect, with rule weight `w`                                                                | Use it for                                     |
| --------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `add`     | Plays a new sound at gain `w`.                                                              | Creaking trees, canopy rain, a ridge whistle   |
| `replace` | Crossfades a layer to a new sound: the old one at `1 − w` of its gain, the new one at `w`.  | Calm leaves becoming gale leaves               |
| `scale`   | Multiplies a layer's gain by a value between 1 and `by`, moved by `w`. `by: 0` silences it. | Birds quiet in rain, louder at dawn            |
| `muffle`  | Moves a layer's low-pass cutoff from fully open toward `cutoff` Hz, moved by `w`.           | Snow dampening the land, fog dulling far calls |

- Rules apply in list order. A `scale` after a `replace` scales the new sound too.
- `add` and `replace` take a `gain` for the sound they bring in, for example `"gain": 0.6`.
- **A replaced layer carries over.** The new sound takes the layer's id, tags, gain and cutoff, so
  a night layer replaced in the rain is still silent by day, and later rules on the layer act on
  the new sound too.
- **An added sound** takes the rule's `id` as its layer id, and the rule's `tags`, if any. Rules
  after it in the list can act on it.
- When two `muffle` rules act on one layer, the lower cutoff wins. Two muffles do not stack.
- A target is a layer id, a tag (`"#birds"`), `"*"` for every layer, or a list of them.
- **Replace or add?** Use `replace` when the calm and the windy sound are the same thing in two
  moods, like leaves. Use `add` when the weather brings a new thing, like creaking or rain drops.
- **Muffle or the under-water filter?** Under water is one low-pass on the whole world bus, in
  every biome. `muffle` changes chosen layers in a place, because of the weather. Every bed has a
  low-pass for this. A biquad filter is cheap, and it is fully open when no rule acts on it.

#### The rule engine

`RuleSet` in `packages/rewild-audio` runs the rules for the soundscapes, the footsteps and the
voice.

```ts
const signals = new RuleSignals({
  numbers: ['windiness', 'rain', 'sun'],
  states: { state: WEATHER_STATE_IDS },
});
const forest = new RuleSet(signals, profiles.forest, profiles['*']);

signals.set('windiness', sky.windiness); // each frame
signals.setState('state', atmosphere.state);
signals.update(seconds); // eases the state weights
forest.evaluate(); // fills forest.gains and forest.cutoffs
```

- **Slots.** The layers, then the sounds the rules bring in, in order. `slotIds`, `slotSounds`
  and `slotTags` describe them, and `gains` and `cutoffs` hold the result. `ruleIds` and
  `ruleWeights` show each rule's weight, for debugging.
- **Compiling.** The constructor compiles the profile over the base's rules into flat arrays. It
  throws on an unknown signal, state value, layer id or `without` id, and on a rule without
  exactly one action. A tag or `*` may match no layer, as a base rule does in a biome without it.
- **Layer gains.** `evaluate(layerGains)` scales each layer first, for layers whose level the
  caller sets. Footsteps use it for the share of each surface under the foot.
- **States.** A state's weight rises from 0 to 1 over 4 s after it begins and falls back after it
  ends, eased. `settle()` snaps the weights, as on a load.
- **Cost.** `evaluate` reads signals by index and writes into the set's own arrays. It allocates
  nothing.

#### How it is worked out

1. The `BiomeProbe` gives the biome weights at the player.
2. For each biome with weight, its `RuleSet` gives a gain and a cutoff for each sound. It uses no
   Web Audio, so jest tests it.
3. Each gain is multiplied by the biome weight. A sound in two biomes sums.
4. The soundscape sends each gain and cutoff to its bed with `setTargetAtTime`. The bed's attack and release
   smooth it further.

Signals change every frame, but the profiles do not. The soundscape compiles each profile once at
load into flat arrays, so the frame does no lookups by name and no allocation.

#### First profiles

Every biome also gets the base rules: wildlife quiets in rain and gales and stops in storms, birds
sing louder at dawn and after rain, snow dampens and fog dulls far calls.

| Biome           | Layers                                    | Own rules, after the base                                                 |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| plain           | grass, larks by day, crickets by night    | wind replaces soft grass with hissing grass                               |
| forest          | leaves, songbirds by day, owls by night   | the profile above                                                         |
| mountain        | thin air, a far raven by day              | wind adds a ridge whistle                                                 |
| desert          | dry air, cicadas by day, insects by night | wind adds blowing sand, `without: ["gale-quiets-wildlife"]` keeps cicadas |
| desert-mountain | dry thin air                              | wind adds a ridge whistle                                                 |
| beach-sand      | gulls by day                              | none, the surf bed does the rest                                          |

### Wildlife calls in 3D

The beds give the background. **Calls** give the life in it:

- Each profile lists its calls, with the same `when` conditions as layers.
- Every few seconds, the soundscape may pick a call from the biomes at the player, for example a
  woodpecker, a crow or a hawk. The rule weights and the biome weight set the chance.
- It plays the call on a 3D emitter 20 to 80 m from the player, at a random bearing and at a
  height that suits it. Birds call from above, insects from the ground.

```json
"calls": [
  { "sound": "woodpecker", "when": { "sun": [0, 0.3], "rain": [0.3, 0] }, "every": [8, 25], "height": [6, 18] },
  { "sound": "owl", "when": { "sun": [0, -0.2] }, "every": [20, 60], "height": [8, 15] }
]
```

This gives sound from all around with no animals in the world. When creatures arrive, they use the
same `audio.play(name, { at })` call from their own position.

## The editor

The editor viewport plays the same soundscape, so a level's weather and biomes can be heard while
it is built.

- **The toggle.** A speaker button in `PositionReadout`, under the lens effects button. It saves
  its state in localStorage as `rewild.editor.sound`, in the same way. It is off by default.
- **`EditorSound`** in `src/core/audio/` does the work. The readout creates it on mount and
  disposes it on cleanup.
- **Off is silent, not stopped.** Off silences the master with the `'editor'` reason, so beds and
  emitters keep their state and come back as they were. See [Silencing](#silencing).
- **The start.** The click on **Editor** in the main menu already started the context. The toggle
  only says whether the editor plays its sound.
- **The listener** is the editor camera. Weather, thunder, water, biome soundscapes and calls all
  read the listener's position, so they work with no player.
- **No player sounds.** There is no player in the editor, so no footsteps, breathing or splashes.
- **The loop.** The editor renders on the renderer's own animation frame, which has no hook. While
  sound is on, `EditorSound` runs its own animation frame that sets the listener from the editor
  camera and calls `audio.update()`, as `GameManager.onUpdate` does in the game. While it is off,
  the loop does not run.
- **The scope.** `EditorSound` opens a scene scope, so console sounds in the editor belong to it.
- **Leaving the editor** fades out the editor's scope and lifts the `'editor'` silence. The engine
  keeps running.

## Electron

Electron is Chromium, so this design runs in it unchanged. Electron also allows:

- **No autoplay block.** `app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')` turns off the user-gesture rule, so the context runs on arrival.
  The gesture start stays for the browser.
- **An output device setting.** `AudioContext.setSinkId` picks a device, for example headphones.
  It works in Chrome too.
- **Audio in the background.** The window can keep playing when it does not have focus. The
  **Mute when in the background** setting controls this.

## Settings

A new **Audio** tab in `SettingsPanel.tsx`, next to **Display**. A few sliders cover every bus:

| Setting                     | Bus    | Default |
| --------------------------- | ------ | ------- |
| Master volume               | master | 80%     |
| Music volume                | music  | 100%    |
| World volume                | world  | 100%    |
| Player volume               | player | 100%    |
| Interface volume            | ui     | 100%    |
| Mute when in the background |        | On      |

The world slider covers ambience, weather and effects together. A new bus joins one of these
sliders, not a new one.

`AudioSettings` in `packages/rewild-audio` holds them. `src/core/audio/audio.ts` creates the one
instance, `audioSettings`, next to the engine.

- **Storage.** It stores them as JSON in localStorage under `rewild.audio`, in the same way as
  `QualitySettings`. The constructor restores them and keeps only known settings with valid values,
  so a stale or hand-edited entry falls back to its default.
- **No Apply.** A slider change takes effect at once and is stored at once. The modal's Apply and
  Cancel buttons are for the Display tab only.
- **The volume curve.** A slider position becomes a bus gain by squaring it, so half way is about
  -12 dB and the slider's travel sounds even. `setAudioVolume` in the console sets a bus gain
  directly, with no curve.
- **Background mute.** `audioSettings.bindBackgroundMute(window)` silences the master with the
  `'background'` reason on `blur` while the setting is on, and lifts it on `focus`. The same
  setting decides whether a hidden tab suspends the context; see
  [Start, focus and pause](#start-focus-and-pause).

## Sound list (steps 1 to 22)

The minimum set of files. Each loop must loop with no gap or click.

| Group      | Sounds                                                                                                                                  | Kind      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Wind       | 3 air loops calm to windy, ears roar, 2 gust swells                                                                                     | Mixed     |
| Rain       | light rain, heavy rain, drips                                                                                                           | Loops     |
| Thunder    | 3 close cracks with rumble, 3 far rumbles, 6 short chain cracks                                                                         | One-shots |
| Water      | under-water bed, ocean surf calm and storm, lake lapping                                                                                | Loops     |
| Swimming   | 4 strokes, 4 under-water strokes, 4 bubbles, 3 emerges, small and big plunge, surface                                                   | One-shots |
| Dripping   | body drips                                                                                                                              | Loop      |
| Footsteps  | 6 each of grass, leaves, dirt, rock, sand, snow, wet and splash                                                                         | One-shots |
| Body       | 3 jumps, 4 landings, 3 hard landings, 2 flashlight clicks, death                                                                        | Mixed     |
| Voice      | 3 pain sizes, 3 gasps, strain, calm, hard and panting breath loops, swim breaths, heat panting, cold shivers, heartbeat, stomach growls | Mixed     |
| Sliding    | crumbling dirt and snow slide loops, 5 slips, 4 debris crumbles, 4 stone rattles, 3 scrabbles                                           | Mixed     |
| Biome beds | the layers and the `add` and `replace` sounds in each profile                                                                           | Loops     |
| Calls      | 3 to 6 per biome                                                                                                                        | One-shots |

## Code changes outside the audio code

| Where                        | Change                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Application`                | Start the engine on the first user gesture. Keep it for the whole session.                                          |
| `GameManager`                | Set the listener and call `audio.update()` after `renderer.onFrame()`. Open a scene scope, and close it on dispose. |
| `Player.ts`                  | Own a `PlayerSounds`, fill in its state each frame, and call it for the jump, the flashlight and the death.         |
| `LightningController.ts`     | A strike queue: a ring buffer of 8 records with the position, the chain index and the time.                         |
| `PositionReadout.tsx`        | Use the new shared `BiomeProbe`. Add the sound toggle, which owns an `EditorSound`.                                 |
| `TerrainRenderer.ts`         | `sampleSplat(x, z, out)`, the splat weights at a point, and `sampleSlip(x, z)`, how slippery the ground is there.   |
| `Sliding.ts`                 | `slideDamage` and `impactDamage`, `GroundSlide.collide` and `climbing`. Slippery ground and the skid.               |
| `TerrainMaterials.ts`        | `slip` on each material, 1 on the mountain snow.                                                                    |
| `InGame.tsx`                 | Duck and lift the world bus when the menu opens and closes. No duck over the Game Over menu.                        |
| `SettingsPanel.tsx`          | The Audio tab.                                                                                                      |
| `src/core/debug/`            | `AudioDebugCommands.ts`, registered by `Application` when the app starts.                                           |
| `templates/sounds.json`      | The manifest.                                                                                                       |
| `templates/soundscapes.json` | The biome soundscape profiles.                                                                                      |
| `templates/footsteps.json`   | The material to surface map, the surfaces and the footstep rules.                                                   |
| `esbuild.js`                 | Copy nothing new. `templates/` is already copied.                                                                   |

## Steps

Each step below becomes one issue. A step is done when its **Expect** list is true in the game.
The steps run in order.

Every step that plays a sound also adds those sounds to `templates/sounds.json` and pushes the
files to the bucket with `npm run assets:push`. Every step adds its debug commands to
[Debugger & Console Commands](../debug-commands.md) and its tests to jest.

### Phase 1: The engine

#### 1. The audio package and the mixer

- **Delivers.** `packages/rewild-audio` with `AudioEngine`: the `AudioContext`, its start, suspend
  and resume, the bus graph (master, world, ambience, weather, effects, player, music, UI), the
  under-water and menu-duck inserts, and the master compressor. The debug commands `audio()`,
  `setAudioVolume`, `muteAudio` and `soloAudio`.
- **Expect.** The package builds with `npm run ts-check` and `node ./esbuild.js`. Jest tests cover
  the bus gain math. `audio()` logs the context state and the bus gains. Nothing plays yet.

#### 2. The sound bank and the manifest

- **Delivers.** `SoundBank`: it reads `templates/sounds.json`, loads files through
  `resolveAssetUrl`, decodes them, and picks a random file, pitch and gain for each play. The
  `source` and `license` fields on each entry. 2D one-shots. The `playSound(name)` command. A
  first test sound in the bucket.
- **Expect.** `playSound('test')` plays the test sound. Called again, it picks a different file or
  pitch. A missing file logs one clear error and does not stop the game.

#### 3. Beds

- **Delivers.** `Bed`: a looping layer with a gain, an optional low-pass, attack and release, and
  `setTargetAtTime` on every change. Layers in one bed with crossfade weights. Random start offsets.
  A bed that stays silent stops its source. The `holdBed(name, gain)` command.
- **Expect.** `holdBed('test-loop', 0.5)` fades the loop in with no click. `holdBed('test-loop', 0)`
  fades it out, and `audio()` shows its source stopped a few seconds later. Moving the gain each
  frame makes no zipper noise.

#### 4. 3D emitters and the listener

- **Delivers.** The voice pool: 24 HRTF `PannerNode` voices, `play`, `loop`, `move` and `stop`,
  delays on the context clock, priority, and voice stealing by loudness. Emitters with virtual
  voices, and `audio.update()` in `GameManager.onUpdate`. The listener, set from the camera's
  world matrix each frame. `playSound`, `playSoundNear`, `addEmitter`, `addEmitterNear`,
  `clearEmitters` and `setPanning`.
- **Expect.** A sound played 20 m to the left is heard on the left, and moves to the right when the
  camera turns around. Playing 40 sounds at once keeps 24 and drops the quietest. An emitter goes
  virtual as the player walks away and plays again on the way back. `audio()` shows the voices
  and the emitters.

#### 5. Sound in the game

- **Delivers.** `AudioScope`, and a scene scope for each game. The in-game menu ducks the world. A
  hidden tab suspends the context. A restart keeps the engine and fades out the old game's sounds.
  Quitting to the main menu fades out the game's sounds. Console sounds started in a game belong to
  its scope.
- **Expect.** In a game, `holdBed('test-loop', 0.5)` plays. Open the menu and the world goes
  quieter. **Resume** brings it back. Switch tabs and the sound stops. Switch back and it plays
  again. Restart and the bed fades out, with nothing loaded again. Quit and the sound fades out.

#### 6. Audio settings

- **Delivers.** `AudioSettings`, saved in localStorage as `rewild.audio`. An **Audio** tab in
  `SettingsPanel.tsx` with master, music, world, player and interface sliders and **Mute when in
  the background**.
- **Expect.** Each slider changes its bus at once, with no Apply. The values are still there after
  a reload. With the mute setting on, clicking out of the window mutes the game.

#### 7. Sound in the editor

- **Delivers.** A sound button in `PositionReadout`, saved as `rewild.editor.sound` and off by
  default. `EditorSound`: a scene scope for the editor, the `'editor'` silence, and a frame loop
  that follows the editor camera and calls `audio.update()` while sound is on. Named silencers in
  the engine.
- **Expect.** With sound off, `holdBed('meadow', 0.5)` is silent. Click the button and it plays.
  Click again and it is silent. The button keeps its state after a reload. Leaving the editor fades
  the sound out.

### Phase 2: Weather

#### 8. Wind

- **Delivers.** `WorldSound` and `WindSound`. The air bed of three loops, blended and filtered by
  `windiness` and swelled by gusts. The ears emitter upwind of the listener, from
  `windBlurShare × windFacing × gust envelope`. Gust one-shots as the gust field surges past.
- **Expect.** `setWeather` from calm to storm takes the wind from a soft hiss to a harsh roar. Turn
  into the wind in a gale: the roar rises as the lens blurs. Turn away: both drop. Gusts are heard
  as the trees bend. The roar comes from upwind.

#### 9. Rain, snow and drips

- **Delivers.** The rain bed with light and heavy layers from `rainShare`, the drips bed from
  `rainWetness`, and snow, which only turns the rain down. Muffling for snow comes later, in the
  base profile.
- **Expect.** Rain fades in with the rain particles and gets heavier with them. When the rain stops,
  drips go on for a while and fade as the ground dries. In snow the rain bed is silent.

#### 10. Thunder

- **Delivers.** The strike queue on `LightningController`: a ring buffer of 8 records with the
  position, the chain index and the time. The audio pops it each frame. Thunder delayed by
  `d / 343` from the strike time, picked, filtered and turned down by distance, and played from the
  strike's direction. Short cracks for chained strikes. Rare low rumbles in `FrontApproaching`.
- **Expect.** `triggerLightning()`: the flash, then the thunder 2 to 5.5 s later. A far strike is
  quieter and deeper than a near one. The thunder comes from where the bolt was. A chain gives one
  rumble with extra cracks, not two rumbles. With the editor sound off, strikes do not pile up.

### Phase 3: Rules

#### 11. The rule engine

- **Delivers.** `RuleSet` in `packages/rewild-audio`: conditions (ranges, eased states, more than
  one at once), named signals, layer ids and tags, the `add`, `replace`, `scale` and `muffle`
  actions, rule ids and `without`, and profiles that extend a base. Profiles compile once into flat
  arrays.
- **Expect.** Jest tests cover each condition and each action, the rule order, two muffles on one
  layer, and a base rule turned off with `without`. An evaluation each frame allocates nothing.
  There is no new sound yet.

### Phase 4: The player

#### 12. Under water

- **Delivers.** `Player.cameraUnderWater` drives the world low-pass and gain. The under-water
  bed. The plunge, scaled by `verticalVelocity`, and the splash on surfacing.
- **Expect.** Dive and the world goes dull and quiet, and the under-water hum comes in. Thunder
  under water is a deep thud. Jump off a cliff into a lake for a big plunge, step in for a small
  one. Surface for a splash.

#### 13. Footsteps

- **Delivers.** `TerrainRenderer.sampleSplat`. `Footsteps`, held by `PlayerSounds`.
  `templates/footsteps.json` with the material map, the surfaces and the rules for wet ground,
  wading, speed and crouching. Steps by distance moved.
- **Expect.** Walk from grass onto rock, then onto snow on a mountain: each step sounds like the
  ground under it. Patchy snow sounds like snow and rock. Sprint for louder, faster steps, crouch
  for soft ones. After rain the steps sound wet. Wade in and the steps splash, then become only
  splashes. A new material with no map entry plays the fallback.

#### 14. Jumps, landings and swimming

- **Delivers.** Jump, landing and hard landing sounds, with a footstep on the surface landed on.
  Swim strokes, diving strokes and bubbles. The flashlight click.
- **Expect.** A jump pushes off, a landing thuds, and a long fall thuds hard. Walking off a steep
  slope onto flat ground plays no landing. Swimming makes a stroke for each stroke, and under
  water the strokes are muffled. F clicks.

#### 15. Sliding

- **Delivers.** The crumbling slide loop and the snow slide loop, the slip when a slide starts,
  crumbles and stone rattles downhill, the burst over a cliff edge, and scrabbling on steep ground.
  Damage from a fast slide. Slippery ground from the materials' `slip`: slides start sooner and
  run on, walking skids, and a slide on it does no harm. `Bed.setRate`.
- **Expect.** Slide down a steep slope: the ground gives way under the feet, the crumbling gets
  louder and higher as the slide speeds up, and dirt and stones fall away below. Slide down snow
  and it sounds like snow. Slide off a cliff: a last spill of dirt from the edge, silence in the
  air, then the landing. Push uphill on ground that is too steep and the feet scrabble. A long
  slide down a steep mountain face hurts, and can kill. On the mountain snow the player skids when
  they stop or turn, a slide runs on past the bottom, and sliding down it does no harm.

#### 16. Breath and voice

- **Delivers.** The body values (`effort`, `breathHeld`, `heat`, `cold`, `hurt`), the one-mouth
  voice with its priorities, the breathing rules, the gasp and the strain, pain grunts, the
  heartbeat at low health, and the stomach growl.
- **Expect.** Sprint and the breathing gets harder, then settles at rest. Swim and each stroke has a
  breath. Stay under water for 20 s for the strain, then surface for a big gasp. Stand in the
  desert sun for panting, in snow for shivers. A fall that hurts gives a grunt sized to the damage.
  Below 25 health, the heartbeat comes in. No two voice sounds play at once.

#### 17. Death

- **Delivers.** The death sound from `Player._die()`, after the hard landing if a fall caused it.
  The world fades and goes dull over 2 s and stays that way behind the Game Over menu. Restart
  brings the world back.
- **Expect.** Fall to death: a hard landing, the death sound, then the world fades away. The
  heartbeat and breathing stop. The Game Over menu does not duck the world further. Press
  **Restart** and the new game's world comes back over about 1 s.

### Phase 5: The land

#### 18. Surf and lapping

- **Delivers.** The surf emitter on the nearest shore point from `ShoreField`, with calm and storm
  layers from the sea state. Lake lapping from the palette's `lapping` value. The water's kind from
  `typeWeights`.
- **Expect.** The surf gets louder as you walk to the beach and comes from the beach. A storm sea
  crashes, a calm sea washes. A lake laps quietly, and more in wind. A lagoon blends the two. The
  same happens with the editor camera.

#### 19. The biome probe

- **Delivers.** A shared `BiomeProbe` from the logic in `PositionReadout`, with painted biomes. The
  readout uses it. The soundscape runs it at 5 Hz at the listener.
- **Expect.** The editor readout shows the same biomes as before. Jest tests cover the probe.
  There is no new sound yet.

#### 20. Soundscapes

- **Delivers.** `templates/soundscapes.json`, the base profile, and the forest profile from this
  doc. Biome weights times rule results drive the beds. The signals table. The base rules for
  wildlife, dawn, snow and fog. The `soundscape()` and `reloadSoundscapes()` commands.
- **Expect.** In a forest on a calm day: leaves and birds. Raise the wind: the leaves turn to a
  roar, the trees creak and the birds go quiet. Rain: drops on the canopy, and the birds stop. A
  storm: no birds at all. After the storm the birds come back loud. At night the owls replace the
  birds. Snow makes everything dull. `reloadSoundscapes()` applies an edit with no reload.

#### 21. The first six profiles

- **Delivers.** Profiles and sounds for plain, mountain, desert, desert-mountain and beach-sand.
- **Expect.** Walk from a plain into a forest and the sound crossfades as the ground changes. Each
  biome has its own day and night. The desert keeps its cicadas in wind. The mountain whistles in
  a gale. An arid world loads no temperate sounds.

#### 22. Wildlife calls in 3D

- **Delivers.** Calls in each profile, with `when`, `every` and `height`. Each call plays on an
  emitter 20 to 80 m from the listener.
- **Expect.** A woodpecker knocks from somewhere in the trees, from a new place each time. Owls
  call at night only. Calls stop in rain and storms. Turn toward a call and it is in front of you.

### Phase 6: Stretch

Each of these is its own issue, and none of them blocks the milestone.

- **23. Echo in valleys.** A `ConvolverNode` driven by how open the terrain is around the listener.
  Expect thunder and calls to ring on in a valley and to sound dry on open ground.
- **24. Rain on open water.** Its own rain layer when the listener is near or on water. Expect rain
  on a lake to hiss, not patter.
- **25. Output device.** An output device setting from `AudioContext.setSinkId`. Expect the game to
  play through the chosen device, in Chrome and in Electron.

## Performance notes

- **Main thread.** Each frame sets about 30 `AudioParam` targets and reads a few numbers. The
  biome probe runs at 5 Hz, as in the editor. This is well under 0.1 ms.
- **Audio thread.** Beds are 2D, so they cost a gain and maybe a filter each. Only emitters use
  HRTF. The pool caps them at 24.
- **Silent beds stop.** A bed at zero gain stops its source after a few seconds.
- **No allocation per frame.** Emitters come from a pool. Mapping functions write into existing
  objects.

### Decode or stream

There are two ways to play a loop. **Decode** unpacks the whole file into float PCM in memory
before it plays, about 0.38 MB per second of stereo at 48 kHz. It loops with no gap. **Stream**
plays the file through an `<audio>` element and unpacks it a little at a time. It costs almost no
memory, but Chrome can leave a short gap or click where the loop joins. A gap in a wind or rain bed
is easy to hear. So every sound is decoded. Streaming is for one long sound, such as music.

Memory has no budget in this milestone. `audio()` logs the decoded size of the bank, so the cost
of each sound is visible while the sounds are chosen.

## Debugger / console functions

| Command                       | What it does                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `audio()`                     | Logs the context state, bus gains, active beds and their gains, and voices.                |
| `setAudioVolume(bus, value)`  | Sets a bus gain, 0 to 1.                                                                   |
| `muteAudio(bus?)`             | Mutes a bus, or all audio. Call again to unmute.                                           |
| `soloAudio(bus)`              | Plays one bus only, to tune it.                                                            |
| `playSound(name, [x, y, z]?)` | Plays a sound from the manifest, at a position or in 2D.                                   |
| `holdBed(name, gain)`         | Holds one bed at a gain, to hear it alone.                                                 |
| `soundscape()`                | Logs the biome weights, the signals, each rule's weight, and each layer's gain and cutoff. |
| `reloadSoundscapes()`         | Loads `soundscapes.json` again, to tune rules with no reload of the game.                  |
| `footsteps()`                 | Logs the footstep signals, the surfaces under the last step, and each layer's gain.        |

They follow the conventions in [Debugger & Console Commands](../debug-commands.md).

## Open questions

- **Body stats.** Heat, cold and effort are sound only here. Should they become gameplay, for
  example heat that drains health? That belongs to its own milestone, but the voice is ready for it.
