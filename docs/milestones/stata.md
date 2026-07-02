# Milestone: Strata — terrain foundation

**Codename:** Strata
**Theme:** the data-model foundation the rest of the terrain roadmap sits on.

## Why this milestone

Terrain today is **pure procedural, heightmap-based, endless + chunked**, and
**stateless** — nothing is persisted, and there is no per-world seed, so _every
"random" world is byte-for-byte identical_. The five "biomes" are hardcoded
height-colour bands, not a real biome concept. Generation parameters are
hardcoded globals.

Almost everything we want next — painting, biomes, water, object scatter, saved
games — needs a place to store data and a way to vary worlds, neither of which
exists. **Strata builds that spine** so the visual features can land on top
without re-architecting later — and then delivers the first hands-on payoff,
**terrain sculpting** ([#175](https://github.com/MKHenson/rewild/issues/175)),
proving the whole stack end to end.

## Current state (what exists today)

- **Generation:** `TerrainWorker.ts` defines generation as hardcoded globals
  (`NOISE_SCALE=400`, `NOISE_OCTAVES=6`, `NOISE_PERSISTENCE=0.5`,
  `NOISE_LACUNARITY=2.0`, `HEIGHT_SCALE=80`) plus a `pow(h, 1.5)` height curve.
- **No per-world seed:** `generateNoiseMap` accepts a `seed` (`Noise.ts:17`,
  default `100`), but `TerrainWorker.ts:19` passes `undefined`. Per-chunk
  variation is purely positional `offset`, so every world is identical.
- **Seamless boundaries:** normalisation uses a fixed theoretical max amplitude
  (`Noise.ts:67–69`), not per-chunk min/max — this is what keeps chunk borders
  seamless. **Any change to generation must preserve this.**
- **"Biomes":** height-colour bands in `TerrainWorker.ts` (lines 32–74) —
  cosmetic only, no spatial regions, no biome data.
- **Workers:** a 4-worker pool (`TerrainWorkerPool.ts`); the worker message is
  `{ chunkSize, lod, position }` (`TerrainWorker.ts:13`).
- **Editor:** terrain is **already on** in the editor — `raycastToSurface`
  (`WorldPlacement.ts`) feeds the orbit camera and drag-drop placement
  (`EditorViewport.tsx`). No editor-instantiation work is needed.
- **Persistence:** none for terrain. `ILevel` has an unused `hasTerrain: boolean`
  (`src/types/models.d.ts`, mirrored in `server/.../models/Level.kt`).

## Infrastructure we build on

- **A binary blob path already exists**, separate from the IndexedDB record sync:
  - Client cache: `src/database/local-asset-store.ts` stores blobs in **OPFS**
    keyed `levels/{levelId}/{assetType}/{filename}` (`write()`/`read()`/`sync()`).
  - Server: presigned-URL flow — `POST /api/assets/upload-url`,
    `POST /api/assets/confirm`, `GET /api/assets`
    (`server/.../assets/{AssetRoutes,AssetService,S3Client}.kt`), backed by
    **MinIO** in Docker (`server/docker-compose.yml`).
  - **A test fixture already anticipates terrain chunks** on this path:
    `assetType: 'chunk'`, `filename: 'terrain.bin'`
    (`src/database/local-asset-store.spec.ts`). This is the path chunk snapshots use.
  - Local dev with **no S3** still works: OPFS read/write functions; server sync
    is skipped when no upload URL is returned (`requestUploadUrl()` → `null`).

## Storage flow (local-first → auth-gated sync)

Chunk snapshots follow the same path as every other asset:

1. **Write is local-first (OPFS, no server).** Editing a chunk calls
   `LocalAssetStore.write()` → bytes go to **OPFS**
   (`levels/{levelId}/chunk/{cx}_{cy}.bin`) and an IndexedDB metadata row is
   upserted and marked **dirty** (`updatedAt > syncedAt`). This works **offline /
   logged out** — no server or local API is involved.
2. **Sync is auth-gated and pushes to the bucket.** `db.syncAll()` →
   `assets.sync()` returns immediately if there's no auth token. When
   authenticated it **pushes** each dirty asset and **pulls** any server assets
   missing from OPFS. The push is a **presigned-URL** flow: request a PUT URL,
   `PUT` the bytes **directly to MinIO/S3** (the app server never proxies the
   data), `confirmUpload()`, then `markSynced()` clears the dirty flag.
3. **Re-edits override and re-upload.** A chunk can be overridden any number of
   times. Re-editing **overwrites** its OPFS file and `write()` `patch()`es the
   existing metadata row, bumping `updatedAt` so it becomes **dirty again**. The
   next sync re-uploads it, overwriting the **same bucket object** (same storage
   key) — latest edit wins.
4. **Trigger.** Sync currently fires in the background from `ProjectStore` (on
   save/publish) and no-ops without a token, so the _effect_ is "uploads once
   authenticated." To flush pending edits **promptly on login**, `syncAll()`
   should also be invoked from `authService.onAuthStateChanged` (work item in
   [#174](https://github.com/MKHenson/rewild/issues/174)).

## Design overview & key decisions (agreed)

- **Stay heightmap.** Sculpting ([#175](https://github.com/MKHenson/rewild/issues/175)) is raise/lower/smooth/flatten. No
  caves/overhangs/arches — those need a voxel rewrite and are explicitly deferred.
- **Per-world seed.** A single integer carried on the recipe, fed into both the
  Perlin permutation and the octave-offset RNG so the whole world shifts
  coherently. Same seed + position ⇒ identical height, every load. This
  determinism is the contract persistence relies on.
- **The recipe lives on the project, next to `atmosphere`.** `WorldGenConfig`
  (seed + biome table) is stored on `IProject.sceneGraph.terrain`, mirroring how
  the existing world-environment config (`atmosphere`) is modelled, and it flows to
  both editor and game the same way. `hasTerrain` stays the Level-side runtime
  gate; chunk snapshot blobs stay keyed by `levelId`.
- **Changing the seed wipes saved chunks.** A new seed is a different world, so
  existing chunk snapshots (edits to the old terrain) no longer apply — applying a
  new seed prompts to confirm, then discards them and regenerates.
- **Biomes vary _within_ a world, not _per_ world.** A low-frequency **biome
  map** selects, per world-position, which biome is active; a **per-biome
  parameter table** drives height; neighbouring biomes **blend across a
  transition band** (mountain eases into plain). Ship with **two biomes — mountain and
  plain**; more biomes are table rows, not new code.
- **Persistence = recipe + saved chunk snapshots.** Unedited chunks regenerate
  deterministically from the recipe and are never stored. An **edited** chunk is
  saved as a **full heightfield snapshot** on the asset path (`assetType='chunk'`),
  and once saved it is **fetched-and-meshed instead of regenerated** ("saved ⇒ not
  generated"). Storage is O(edited chunks).
- **A snapshot is a whole, frozen chunk** — internally consistent and immune to
  later changes in the generation algorithm or biome tuning (you sculpted it; it
  stays). Simpler than merging sparse edits onto a regenerated base, and more
  robust. The **recipe is versioned**, and snapshots carry a format version too;
  raw `f32` heights now, with a reserved flag for optional compression later.
- **Worlds are endless.** Storage is O(edited chunks), so world size costs
  nothing. (Float-precision jitter at extreme coordinates — floating-origin — is
  a pre-existing endless-terrain concern, out of scope here.)
- **Prove the format before the UX.** The first _writer_ of snapshots is a dev/test
  hook ([#174](https://github.com/MKHenson/rewild/issues/174)) that locks the
  save/load contract in isolation; the real **sculpt brushes**
  ([#175](https://github.com/MKHenson/rewild/issues/175)) then build on exactly that
  write path.

## Issues (build order)

Work top-to-bottom; arrows are hard dependencies.

| GitHub                                                | Spec                                                                             | Depends on                                                                                                   | Summary                                                                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| [#170](https://github.com/MKHenson/rewild/issues/170) | [01 — Seeded worlds (end-to-end)](issues/01-world-seed.md)                       | —                                                                                                            | Seed into the noise + `WorldGenConfig` on `sceneGraph.terrain` + persist/load + editor seed dialog.                      |
| [#171](https://github.com/MKHenson/rewild/issues/171) | [02 — Biome map + blended generation](issues/02-biome-generation.md)             | [#170](https://github.com/MKHenson/rewild/issues/170)                                                        | Low-freq biome map + plain/mountain param table; blend heights across borders.                                           |
| [#172](https://github.com/MKHenson/rewild/issues/172) | [03 — Recipe: biome table + terrain gating](issues/03-world-recipe.md)           | [#170](https://github.com/MKHenson/rewild/issues/170), [#171](https://github.com/MKHenson/rewild/issues/171) | Append the biome table to the recipe + feed it into generation; make `hasTerrain` gate terrain.                          |
| [#173](https://github.com/MKHenson/rewild/issues/173) | [04 — Chunk snapshot — read & mesh](issues/04-chunk-snapshot-read.md)            | [#172](https://github.com/MKHenson/rewild/issues/172)                                                        | Full-heightfield snapshot format + read from the blob path; saved chunks mesh from stored heights instead of generating. |
| [#174](https://github.com/MKHenson/rewild/issues/174) | [05 — Chunk snapshot — write (dev/test hook)](issues/05-chunk-snapshot-write.md) | [#173](https://github.com/MKHenson/rewild/issues/173)                                                        | A dev/test writer that round-trips a snapshot: write → reload → fetch-and-mesh.                                          |
| [#175](https://github.com/MKHenson/rewild/issues/175) | [06 — Terrain sculpting (editor brushes)](issues/06-terrain-sculpting.md)        | [#173](https://github.com/MKHenson/rewild/issues/173), [#174](https://github.com/MKHenson/rewild/issues/174) | Raise/lower/smooth/flatten brushes in the editor; affected chunks saved as snapshots.                                    |

[#170](https://github.com/MKHenson/rewild/issues/170) is a full vertical slice
(seeded worlds: generation plumbing + the persisted `WorldGenConfig` recipe + load

- editor seed dialog). [#171](https://github.com/MKHenson/rewild/issues/171) adds
  biome-blended generation on top of the seed;
  [#172](https://github.com/MKHenson/rewild/issues/172) folds #171's biome table into
  the persisted recipe and gates `hasTerrain`.
  [#173](https://github.com/MKHenson/rewild/issues/173)/[#174](https://github.com/MKHenson/rewild/issues/174)
  add chunk-snapshot persistence (saved edits), and
  [#175](https://github.com/MKHenson/rewild/issues/175) is the first user-facing
  payoff — sculpting — on top of the full round-trip (#173 + #174).

## Out of scope (deferred to later milestones)

- Material/texture **painting** (painting what terrain looks like) and **undo/redo**
  history — height sculpting is in ([#175](https://github.com/MKHenson/rewild/issues/175)),
  but painting needs multiple surface materials first and undo is a follow-up.
- In-game (runtime) sculpting UX — [#175](https://github.com/MKHenson/rewild/issues/175)
  is the editor; the write path is shared so runtime can reuse it later.
- Voxel terrain, caves, overhangs.
- Water, sea level, oceans.
- Object scatter.
- New surface materials / splat layers (biomes keep the existing height-band
  colouring for now; materials arrive with painting).
- A third+ biome and a 2-axis (temperature × moisture) climate model — both are
  additive on top of Strata's architecture.
