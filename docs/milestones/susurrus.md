![Sound](../images/susurrus.jpg)

# Sound (Susurrus)

Rewild has a voice. The wind rises and gusts, rain patters and drips, thunder rolls in late from
the strike, the sea washes on the beach, and each biome has its own day and night life that changes
with the weather. The player has footsteps, splashes, breath and a voice. This page explains what
the sound system does, how it fits together and how to use it.

> **Where the name comes from.** _Susurrus_ means a soft whisper or rustle, like wind in the
> leaves. Susurrus was the milestone that built this system. That work is complete. This page is
> now the plain-English guide to what it gives you.

---

## The short version

- **One audio engine** on the Web Audio API, in `packages/rewild-audio`. It knows nothing about
  the game. It has a mixer, looping **beds**, 3D **emitters**, a **sound bank** and a reverb.
- **The game owns its sounds** in `src/core/audio/`. Each system, such as the wind or the
  footsteps, is a small class that reads the game each frame and drives the engine.
- **Sounds are data.** Every sound is listed in `templates/sounds.json`. Biome soundscapes, footsteps
  and the player's breathing are rules in JSON, so you can tune them without code.
- **The weather is heard.** Wind, gusts, rain, snow and thunder all follow the sky.
- **The land is heard.** Surf on the beach, lapping at lakes, the open sea, and a soundscape for
  each biome that blends as you walk from one to the next. Mountains reverberate.
- **The player is heard.** Footsteps from the ground under the feet, jumps and landings, swimming,
  sliding, breathing, pain and death. Under water, the world goes muffled.
- **It works in the editor too**, with a speaker button, so you can hear a level while you build it.
- **The Audio settings tab** has volume sliders, background mute and an output device picker.

---

## How it fits together

```
packages/rewild-audio      The engine: AudioEngine, Bed, Emitter, SoundBank, RuleSet, AudioSettings
src/core/audio/audio.ts    The one engine and settings instance for the app
src/core/audio/            The game's sounds: WorldSound, PlayerSounds and the classes they hold
templates/*.json           sounds.json, soundscapes.json, footsteps.json, voice.json
assets/shared/audio/       The sound files (Ogg Vorbis)
```

- **`WorldSound`** is the sound of the world around the listener: wind, rain, thunder, surf, the
  open sea and the biome soundscape. The game and the editor each own one.
- **`PlayerSounds`** is the sound of the player: footsteps, body, swimming, sliding, drips, under
  water and the voice. `Player` owns one, fills in its `state` each frame and calls `update`.
- **Each frame**, after the renderer, `GameManager` sets the listener from the camera, updates
  its `WorldSound`, then calls `audio.update()`. The player updates its own sounds in its update.
- **The engine lives for the whole session.** A restart or a quit to the main menu fades out the
  old game's sounds and keeps every decoded file, so nothing loads twice.

**Files to look at:** `AudioEngine.ts`, `audio.ts`, `WorldSound.ts`, `PlayerSounds.ts`,
`GameManager.ts`.

---

## The mixer

Every sound plays on a **bus**. Buses are gain nodes that feed into each other:

```
                         ┌─▶ ambience ─┐
emitters, beds  ─────────┼─▶ weather  ─┼─▶ world ─▶ under-water muffle ─▶ menu duck ─┐
                         └─▶ effects  ─┘                                             ├─▶ master ─▶ compressor ─▶ out
player sounds   ──────────▶ player ─────────────────────────────────────────────────┤
music           ──────────▶ music ──────────────────────────────────────────────────┤
UI sounds       ──────────▶ ui ─────────────────────────────────────────────────────┘
```

| Bus      | What plays on it                                                  |
| -------- | ----------------------------------------------------------------- |
| ambience | Biome soundscapes, surf, lapping, the open sea                    |
| weather  | Wind and rain                                                     |
| effects  | Thunder, splashes, falling stones, bubbles                        |
| player   | Footsteps, the body, swimming, sliding, breath and voice          |
| music    | Music. Nothing plays on it yet.                                   |
| ui       | Interface sounds                                                  |

- **The world bus** holds everything outside the player. Under water, its low-pass falls to
  600 Hz, so the whole world goes dull with one filter.
- **The menu duck** lowers the world by 12 dB while the in-game menu is open.
- **Bus ducks.** `audio.duckBus(bus, level)` lowers ambience, weather or effects under a louder
  sound. Thunder uses it to cut through the rain.
- **The compressor** on the master keeps a close thunderclap from clipping.
- **The reverb** takes a send from the effects and player buses and returns it into the world.
  See [Reverb in the mountains](#reverb-in-the-mountains).
- **Silencing.** `audio.setSilenced(reason, on)` silences the master for a named reason, such as
  `'background'` or `'editor'`, without touching the volumes.

All parameter changes use `setTargetAtTime`, so nothing clicks or zips at any frame rate.

---

## Playing sounds

There are three ways to play a sound. Pick by what the sound is:

| Use        | For                                                    | Example                     |
| ---------- | ------------------------------------------------------ | --------------------------- |
| **Bed**    | A loop with no place: all around the listener          | Rain, wind, a forest's life |
| **Emitter**| A loop that belongs to a place                         | The surf on a beach         |
| **Play**   | A short sound, in 2D or at a point                     | A footstep, thunder         |

```ts
const scope = sceneScope()!; // the running game's sounds

// A one-shot, in 2D or in 3D.
scope.play('plunge-small', { bus: 'effects' });
scope.play('thunder-close', { at: strike, delay: 3.2, gain: 0.8, cutoff: 2500 });

// A bed: set its gain (and cutoff) each frame; it eases there by itself.
const rain = scope.createBed({
  sounds: ['rain-light', 'rain-heavy'],
  bus: 'weather',
  filter: 'lowpass',
  attack: 1,
  release: 2,
});
rain.set(gain, cutoff);
rain.setBlend(0.4); // crossfades across its layers

// An emitter: lives at a place, plays only while it can be heard.
const surf = scope.createEmitter({ sound: 'surf-calm', at: position, rolloff: 0 });
surf.move(position);
surf.set(gain);
```

- **Beds** are 2D. A bed that stays silent for a few seconds stops its source, so a desert bed
  costs nothing in a forest. Layers crossfade with equal power.
- **Emitters** go **virtual** when they are too quiet to hear: silent and costing nothing. They
  take a voice back by themselves as you come near. Owners never track voices.
- **3D sounds** use a pool of 24 `PannerNode` voices. When the pool is full, a new sound takes the
  quietest voice, or does not play if it is quieter than all of them.
- **Scopes.** A scope is a group of sounds that end together. Each game and the editor open a
  **scene scope**. Disposing it fades out everything it played. `sceneScope()` in `audio.ts`
  returns the running one.

The listener follows the camera: `audio.setListenerFromMatrix(camera.transform.matrixWorld)`.

**Files to look at:** `Bed.ts`, `Emitter.ts`, `VoicePool.ts`, `AudioScope.ts`.

---

## Adding a sound

1. Put the Ogg file in `assets/shared/audio/`, in a folder for its group, such as `steps/` or
   `rain/`. Loops must loop with no gap or click.
2. Add an entry to `templates/sounds.json`:

```json
{
  "name": "step-grass",
  "files": ["audio/steps/grass-01.ogg", "audio/steps/grass-02.ogg"],
  "pitch": [0.92, 1.08],
  "gain": [0.8, 1],
  "source": "Soundly: Footsteps Grass Walk",
  "license": "soundly"
}
```

3. Push the file to the bucket with `npm run assets:push`. Others get it with `npm run assets:pull`.

- **Variation.** Each play picks a file at random, never the one before, and a pitch and gain
  from the ranges.
- **`"loop": true`** marks a loop. **`"demand": true`** loads the sound only while something wants
  it. The soundscape sounds are on demand, so a desert world never loads the forest.
- **Licences.** `source` names the original file so it can be found again. `license` is
  `"soundly"`, `"own"`, or a Creative Commons licence such as `"CC0"`. Non-commercial licences are
  not allowed, and CC-BY needs a credit.
- **Loading.** The app fetches every file when it starts and decodes them as soon as the audio
  starts. A missing file logs one error and the sound plays its other files.
- **Starting.** Browsers block audio until the first click or key press. The engine starts on the
  first one, such as **Start** or **Editor**.

**Files to look at:** `SoundBank.ts`, `templates/sounds.json`.

---

## Weather

### Wind

`WindSound` plays three layers from the sky's wind:

- **The air.** A bed of three loops, calm to gale. The windiness crossfades between them and
  opens a low-pass, so a gale is harsh. A gust swells it.
- **Gusts.** A swell plays upwind as the gust at the listener surges. It is the same gust field
  that bends the trees and pushes the player, so a gust is heard, seen and felt together.
- **The ears.** Facing into a gale, a roar rises with the lens blur. Turn away and both drop. It
  comes from upwind.

### Rain and snow

`RainSound` plays a light and a heavy rain loop that crossfade with the rain's strength. After the
rain, a drips bed follows the wet film on the world as it dries. Snow is quiet: the rain fades as
the temperature falls, and the biome soundscapes go dull in snow.

### Thunder

`ThunderSound` reads the strikes from `LightningController.strikes`, a small queue of each
strike's position and time.

- **Late by its distance.** The sound waits `distance / 343` seconds after the flash, so the
  player sees the bolt and counts to the thunder.
- **Near and far.** A strike under 1 km cracks and rumbles. A far one only rumbles, quieter and
  deeper. It comes from the strike's direction.
- **Chains.** A chained strike adds a short crack, not a second rumble.
- **The duck.** Thunder lowers the rain, wind and land under it for a few seconds. `ThunderSound.duck`
  is the level; `WorldSound` applies it to the weather and ambience buses.
- **Distant storms.** Before a storm front arrives, low rumbles play now and then from upwind.

### Above the clouds

`AloftSound` fades the world below away as the listener climbs through the cloud deck, from half
way up it (800 m) to 100 m above its top (1200 m). `WorldSound` ducks the ambience, weather and
effects buses by the climb, and a distant `aloft` loop rises in their place. The loop plays on the
world bus, past those ducks. Closing a scene scope lifts every bus duck.

**Files to look at:** `WindSound.ts`, `windMapping.ts`, `RainSound.ts`, `rainMapping.ts`,
`ThunderSound.ts`, `thunderMapping.ts`, `StrikeQueue.ts`, `AloftSound.ts`.

---

## Water

- **Surf.** `SurfSound` puts calm and storm surf on the nearest shore point the waves reach, from
  `ShoreField.nearestShore`. The sea state crossfades them. It gets louder as you walk to the
  beach and comes from the beach.
- **Lapping.** Lakes lap at the nearest shoreline, more in the wind. Each kind of water in the
  climate's water palette sets how much it laps, so the ocean does not lap and a lagoon laps by
  its share of lake.
- **The open sea.** `OpenSeaSound` plays swell and slosh all around you out on the ocean, where
  the surf has faded.
- **Under water.** `UnderWaterSound` muffles the world and fades in an under-water hum when the
  camera goes under. Plunges are sized by the fall, and surfacing splashes after a real dive.

**Files to look at:** `SurfSound.ts`, `surfMapping.ts`, `lakeShore.ts`, `OpenSeaSound.ts`,
`UnderWaterSound.ts`.

---

## Biome soundscapes

Each biome has its own sound, and the weather changes it. A calm forest has leaves and birdsong.
In a gale the leaves roar, the trees creak and the birds go quiet. In the rain, drops patter on the
canopy. All of this is data in `templates/soundscapes.json`.

`BiomeProbe` gives the biome weights at the listener five times a second. Each biome's profile
plays at its weight, so walking from a plain into a forest crossfades the sound as the ground
changes. A biome with no profile is silent.

### A profile

```json
"forest": {
  "layers": [
    { "id": "leaves", "sound": "forest-leaves-calm" },
    { "id": "birds", "sound": "forest-birds-day", "tags": ["wildlife", "birds", "far"],
      "when": { "sun": [-0.1, 0.2] } },
    { "id": "night", "sound": "forest-night", "tags": ["wildlife", "far"],
      "when": { "sun": [0.1, -0.2] } }
  ],
  "rules": [
    { "id": "gale-leaves", "when": { "windiness": [0.4, 0.8] },
      "replace": "leaves", "with": "forest-leaves-gale" },
    { "id": "creak", "when": { "windiness": [0.6, 1.0] }, "add": "forest-creak" },
    { "id": "canopy-rain", "when": { "rain": [0.05, 0.4] }, "add": "forest-canopy-rain" }
  ]
}
```

- **Layers** are the loops that make the place. A layer can have **tags** and its own `when`.
- **Rules** change the layers when a condition holds.
- **`reverb`**, from 0 to 1, says how much the biome reverberates.

### Conditions

A condition gives a **weight from 0 to 1**, not true or false, so every rule fades in and out with
the weather.

- **A range** `"windiness": [0.4, 0.8]` is 0 at the first value and 1 at the second. If the first
  is higher, the weight rises as the signal falls: `"sun": [0.1, -0.2]` is "night".
- **A state** `"state": "Storm"` eases in over a few seconds after the weather enters it.
- **Several keys** multiply.

| Signal       | What it is                                              |
| ------------ | ------------------------------------------------------- |
| `windiness`  | The wind, 0 to 1                                        |
| `gust`       | The gust at the listener, 0 to 1                        |
| `rain`       | How hard rain falls                                     |
| `snow`       | How hard snow falls                                     |
| `wetness`    | How wet the world is, so it can drip after the rain     |
| `fog`        | How foggy it is                                         |
| `cloudiness` | How cloudy it is                                        |
| `sun`        | The sun's height, -1 to 1, 0 at the horizon             |
| `dawn`       | 1 at dawn, eased                                        |
| `moon`       | The moon's light while it is the key light              |
| `shore`      | How strongly the ocean's surf reaches the listener      |
| `state`      | The weather state, such as `Storm` or `Clearing`        |

### Actions

| Action    | What it does, at the rule's weight                               | Use it for                     |
| --------- | ---------------------------------------------------------------- | ------------------------------ |
| `add`     | Plays a new sound                                                | Creaking trees, canopy rain    |
| `replace` | Crossfades a layer to a new sound                                | Calm leaves becoming gale ones |
| `scale`   | Multiplies a layer's gain toward `by`. `by: 0` silences it.      | Birds quiet in rain            |
| `muffle`  | Moves a layer's low-pass toward `cutoff` Hz                      | Snow dampening everything      |

A target is a layer id, a tag such as `"#birds"`, `"*"` for every layer, or a list of them. Rules
apply in order, so a `scale` after a `replace` scales the new sound too.

### The base profile

The `"*"` profile holds what every biome shares: wildlife goes quiet in rain and gales and stops
in storms, birds sing louder at dawn and after rain, snow dampens everything, fog dulls far calls,
and gulls call by day wherever the surf reaches. Every biome extends it. A biome turns a base rule
or layer off by its id with `"without": ["gulls"]`.

### Reverb in the mountains

Thunder, falling stones, splashes and the player's own sounds ring out in the mountains and sound
dry everywhere else.

- `Soundscape.reverb` sums each profile's `reverb` times its biome weight, and `WorldSound` passes
  it to `audio.setReverb`. The mountain is 1 and the desert mountain 0.8.
- The reverb is built in code with no sound file: a decaying wash, different in each ear, that
  darkens as it fades. `ReverbShape` in `Reverb.ts` sets its length, level, predelay and
  brightness.
- The ambience and weather beds skip it. They are already all around the listener.

### The rule engine

`RuleSet` in `packages/rewild-audio` runs the rules for the soundscapes, the footsteps and the
voice. It compiles a profile once into flat arrays and allocates nothing when it evaluates.

```ts
const signals = new RuleSignals({ numbers: ['windiness', 'rain'], states: { state: STATES } });
const forest = new RuleSet(signals, profiles.forest, profiles['*']);

signals.set('windiness', sky.windiness); // each frame
signals.update(seconds);                 // eases the states
forest.evaluate();                       // fills forest.gains and forest.cutoffs
```

It throws on an unknown signal, layer or rule id, so a typo shows at load, not as silence.

**How to use it.** Edit `templates/soundscapes.json` and run `reloadSoundscapes()` in the console
to hear the change with no reload. `soundscape()` shows each rule's weight and each sound's gain.

**Files to look at:** `Soundscape.ts`, `RuleSet.ts`, `RuleSignals.ts`, `RuleTypes.ts`,
`BiomeProbe.ts`, `Reverb.ts`.

---

## The player

`PlayerSounds` holds every player sound. `Player` fills in its `state` each frame, one reused
object with the feet, the movement, the water, the ground and the body's stats, and calls
`sounds.update(seconds)`. A jump and the flashlight are calls of their own. All player sounds play
in 2D on the player bus. The editor has no player, so it has none of them.

### Footsteps

- **When.** A step plays every stride moved across the ground, so sprinting gives faster steps by
  itself. Steps stop while sliding, swimming or on ground too steep to stand on.
- **The ground.** `TerrainRenderer.sampleSplat` reads the materials under the foot, and
  `templates/footsteps.json` maps each material to a surface, such as grass, rock or snow. Where
  two surfaces meet, both play.
- **Rules.** The same rule engine as the soundscapes adds the wet squelch after rain, splashes as
  you wade, and louder steps sprinting and softer ones crouching.
- A material missing from the map plays the `fallback` surface, so a new material is never silent.

### Body, swimming and sliding

- **Jumps and landings.** A push off, and a thud sized by the fall, with a step on the ground you
  landed on. A landing that hurts is heavier.
- **Swimming.** A stroke every second or so while moving. Under water the strokes are slower and
  muffled, with bubbles. Standing up out of the water plays an emerge, and the body drips for a
  few seconds after a swim.
- **Falling.** A fast fall roars with air and flapping clothes (`FallSound`). Both rise with
  `freefallShare`, from a fall speed of 20 to 45 in `Player.verticalVelocity`'s units, so a jump
  or a short drop stays silent. Drag eases a fall to a terminal speed of 60 (`fallStep`), so a
  long drop holds at full. The roar opens and the flapping quickens as the fall speeds up; both
  cut on landing.
- **Sliding.** The ground crumbles under the feet, louder and higher as the slide speeds up. Dirt
  and stones fall away downhill in 3D. Snow hisses instead. Pushing uphill on ground too steep
  scrabbles.

### Breath and voice

The breath tells the player how their body is doing: out of breath after a sprint, gasping after a
long dive, panting in the desert sun, shivering in snow, hurt after a fall.

- **One mouth.** The voice says one thing at a time, by priority: death, a gasp on surfacing,
  a pain grunt, the strain of holding a breath, then breathing.
- **Breathing rules** in `templates/voice.json` pick the loops from the body's stats: stamina,
  oxygen, body temperature, health and hunger. Some layers play now and then (`every`), and some
  come and go in bouts (`bouts`), such as panting in the heat.
- **Low health** brings in a heartbeat and pulls the world a little away.
- **Death** plays the death sound and fades the world dull and distant behind the Game Over menu.
  A restart brings it back.

**Files to look at:** `PlayerSounds.ts`, `Footsteps.ts`, `BodySound.ts`, `SwimSound.ts`,
`DripSound.ts`, `SlideSound.ts`, `VoiceSound.ts`, `templates/footsteps.json`,
`templates/voice.json`, and the stats in `src/core/routing/utils/`.

---

## In the editor

The editor plays the same world sound as the game: wind, rain, thunder, water and the biome
soundscapes, heard from the editor camera.

- **The speaker button** in the editor's position readout turns it on and off. It is off by
  default and remembers its state.
- Off silences the sound without stopping it, so turning it back on carries on where it was.
- There is no player, so there are no player sounds.

**Files to look at:** `EditorSound.ts`, `PositionReadout.tsx`.

---

## Settings

The **Audio** tab in the settings panel. Every change applies at once, with no Apply, and is
stored in localStorage under `rewild.audio`.

| Setting                     | Default        | What it does                                         |
| --------------------------- | -------------- | ---------------------------------------------------- |
| Master                      | 80%            | Everything                                           |
| Music                       | 100%           | The music bus                                        |
| World                       | 100%           | Ambience, weather and effects                        |
| Player                      | 100%           | The player's sounds                                  |
| Interface                   | 100%           | Menus and buttons                                    |
| Output device               | System default | The speakers or headphones to play through           |
| Mute when in the background | On             | Silences the game while another window has focus     |

- **The volume curve.** A slider becomes a bus gain by squaring it, so the travel sounds even.
- **Output device.** `audio.setOutputDevice(id)` uses `AudioContext.setSinkId`. Chrome hides
  device names until the page has microphone permission, so while the list is empty a
  **Show devices** button asks for it and lets go of the microphone at once. A device that is not
  connected shows as "(not connected)" and the sound plays through the default until it is
  plugged back in.
- **Pausing.** The in-game menu ducks the world. A hidden tab suspends the audio while the
  background mute is on.

**Files to look at:** `AudioSettings.ts`, `OutputDevices.ts`, `SettingsPanel.tsx`,
`OutputDeviceField.tsx`.

---

## Performance

- Each frame sets a few dozen audio parameters and reads a few numbers. The biome probe runs five
  times a second.
- Beds are 2D and cost a gain and a filter each. A silent bed stops its source.
- 3D voices come from a fixed pool of 24, and silent emitters cost nothing.
- Nothing allocates per frame. The mapping functions are plain functions over numbers.
- Every sound is decoded into memory, so loops join with no gap. `audio()` shows the decoded size.

---

## Debugger / console functions

Type these in the browser console.

| Command                                         | What it does                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `audio()`                                       | The audio state, the muffle, duck and reverb, the buses, voices and beds |
| `setAudioVolume(bus, value)`                    | Sets a bus gain, 0 to 1                                                  |
| `muteAudio(bus?)`, `soloAudio(bus?)`            | Mutes or solos a bus                                                     |
| `playSound(name, [x, y, z]?, bus?)`             | Plays a sound, at a point or in 2D                                       |
| `playSoundNear(name, offset?)`                  | Plays a sound near the listener                                          |
| `holdBed(name, gain)`                           | Holds one loop at a gain, to hear it alone                               |
| `addEmitter`, `addEmitterNear`, `clearEmitters` | Places and clears test emitters                                          |
| `setPanning(model)`                             | Switches 3D voices between `'HRTF'` and `'equalpower'`                   |
| `soundscape()`                                  | The signals, the reverb, each rule's weight and each sound's gain        |
| `reloadSoundscapes()`                           | Loads `soundscapes.json` again with no page reload                       |
| `reverbShape(shape?)`                           | Shows or changes the reverb's shape                                      |
| `footsteps()`                                   | The footstep signals, the surfaces under the last step and their gains   |
| `voice()`                                       | The body's stats, what the mouth is saying and each layer's gain         |

The commands are registered in `AudioDebugCommands.ts`. See
[Debugger & Console Commands](../debug-commands.md#audio) for more.

---

## Related docs

- [Weather System](../weather.md): the wind, rain and storms the sound follows.
- [Water (Pelagic)](./pelagic.md): the shore waves, the water palette and swimming.
- [Terrain (Strata)](./strata.md): the biomes and materials the soundscapes and footsteps read.
- [UI](../ui.md): the components the settings panel is built from.
- [Debugger & Console Commands](../debug-commands.md): all the other console commands.
