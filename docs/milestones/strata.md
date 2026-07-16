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

## Current state (updated after #170 + #171 landed)

- **Seeded worlds (#170):** a per-world seed is carried end-to-end
  (recipe → worker → noise) with an editor seed dialog.
- **Climate-driven generation (#171):** height comes from a **temperature ×
  moisture climate model** (`ClimateConfig` in `Biomes.ts`) — two low-frequency
  climate axes select a biome per world position from a band-cell grid, a
  per-biome parameter table (`heightScale`, `noiseScale`, octaves, curve)
  drives height, and heights are smoothstep-blended across band borders (at
  most 4 biome evaluations in a corner, 1 outside transition bands). The config
  is hardcoded as `DEFAULT_CLIMATE`; worlds don't yet reference it — that's
  [#172](https://github.com/MKHenson/rewild/issues/172).
- **Seamless boundaries:** normalisation uses a fixed theoretical max amplitude
  per biome (`Noise.ts`), not per-chunk min/max — this is what keeps chunk
  borders seamless. **Any change to generation must preserve this.**
- **Colour:** still placeholder height-colour bands in `TerrainWorker.ts`, now
  driven by absolute world height, and one hardcoded material for the whole
  world. Real per-biome materials arrive in
  [07](./strata-terrain-materials.md) — ahead of painting, which needs them
  first.
- **Workers:** a 4-worker pool (`TerrainWorkerPool.ts`); the worker message is
  `{ chunkSize, lod, position, seed }`.
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
  (seed + climate preset reference) is stored on `IProject.sceneGraph.terrain`,
  mirroring how the existing world-environment config (`atmosphere`) is
  modelled, and it flows to both editor and game the same way. `hasTerrain`
  stays the Level-side runtime gate; chunk snapshot blobs stay keyed by
  `levelId`.
- **Climate config is game content, not world data.** The climate/biome tables
  are designed and tuned by the developer and live **in code** as named
  presets (one for now; later eras — "worlds back in time" — are more presets).
  A world persists only **which** preset it uses (`climatePreset` id) plus the
  recipe `version`, not the tables themselves. Consequence (accepted): re-tuning
  a preset in code reshapes existing worlds that use it, except sculpted chunk
  snapshots, which stay frozen — the version field exists so a future load can
  detect "generated under older rules".
- **Changing the seed wipes saved chunks.** A new seed is a different world, so
  existing chunk snapshots (edits to the old terrain) no longer apply — applying a
  new seed prompts to confirm, then discards them and regenerates.
- **Biomes vary _within_ a world, not _per_ world.** A low-frequency
  **temperature × moisture climate model** selects, per world-position, which
  biome is active (band cuts on each axis + a cell lookup grid); a **per-biome
  parameter table** drives height; neighbouring biomes **blend across a
  transition band** (mountain eases into plain). Shipped with **two biomes —
  mountain and plain** — split on temperature only; adding a biome is a table
  row + an axis cut + cell entries, not new code. (Decided during #171: the
  2-axis model landed immediately rather than the originally planned 1D biome
  map, so more biomes never need a re-architecture.)
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

| Issue                                                                                            | Depends on                                                                                                   | Summary                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#170 — Seeded worlds (end-to-end)](https://github.com/MKHenson/rewild/issues/170)               | —                                                                                                            | ✅ Done. Seed into the noise + `WorldGenConfig` on `sceneGraph.terrain` + persist/load + editor seed dialog.                                                    |
| [#171 — Biome map + blended generation](https://github.com/MKHenson/rewild/issues/171)           | [#170](https://github.com/MKHenson/rewild/issues/170)                                                        | ✅ Done. Temperature × moisture climate model + plain/mountain param table; blend heights across borders.                                                       |
| [#172 — Recipe: climate preset + terrain gating](https://github.com/MKHenson/rewild/issues/172)  | [#170](https://github.com/MKHenson/rewild/issues/170), [#171](https://github.com/MKHenson/rewild/issues/171) | Persist a climate-preset id on the recipe (presets hardcoded in code); make `hasTerrain` gate terrain.                                                          |
| [#173 — Chunk snapshot — read & mesh](https://github.com/MKHenson/rewild/issues/173)             | [#172](https://github.com/MKHenson/rewild/issues/172)                                                        | Full-heightfield snapshot format + read from the blob path; saved chunks mesh from stored heights instead of generating.                                        |
| [#174 — Chunk snapshot — write (dev/test hook)](https://github.com/MKHenson/rewild/issues/174)   | [#173](https://github.com/MKHenson/rewild/issues/173)                                                        | A dev/test writer that round-trips a snapshot: write → reload → fetch-and-mesh.                                                                                 |
| [#175 — Terrain sculpting (editor brushes)](https://github.com/MKHenson/rewild/issues/175)       | [#173](https://github.com/MKHenson/rewild/issues/173), [#174](https://github.com/MKHenson/rewild/issues/174) | Raise/lower/smooth/flatten brushes in the editor; affected chunks saved as snapshots.                                                                           |
| [#177–#182 — Biome materials & distance normals](./strata-terrain-materials.md)                  | [#171](https://github.com/MKHenson/rewild/issues/171), [#175](https://github.com/MKHenson/rewild/issues/175) | Per-biome material layers on a splat map, blended across and within biomes; macro/detail normal crossfade by distance. Six issues — see the linked design for the build order. |

[#170](https://github.com/MKHenson/rewild/issues/170) is a full vertical slice
(seeded worlds: generation plumbing + the persisted `WorldGenConfig` recipe + load

- editor seed dialog). [#171](https://github.com/MKHenson/rewild/issues/171) adds
  climate-driven biome generation on top of the seed;
  [#172](https://github.com/MKHenson/rewild/issues/172) adds the persisted
  climate-preset reference (the tables themselves stay in code) and gates
  `hasTerrain`.
  [#173](https://github.com/MKHenson/rewild/issues/173)/[#174](https://github.com/MKHenson/rewild/issues/174)
  add chunk-snapshot persistence (saved edits), and
  [#175](https://github.com/MKHenson/rewild/issues/175) is the first user-facing
  payoff — sculpting — on top of the full round-trip (#173 + #174).

## Out of scope (deferred to later milestones)

- Material/texture **painting** (painting what terrain looks like) and **undo/redo**
  history — height sculpting is in ([#175](https://github.com/MKHenson/rewild/issues/175)),
  and [07](./strata-terrain-materials.md) supplies the surface materials painting
  needs, but the painting UX itself and undo stay follow-ups. 07 is designed
  against painting's constraints so it doesn't force a rewrite.
- In-game (runtime) sculpting UX — [#175](https://github.com/MKHenson/rewild/issues/175)
  is the editor; the write path is shared so runtime can reuse it later.
- Voxel terrain, caves, overhangs.
- Water, sea level, oceans.
- Object scatter.
- A third+ biome — still additive on the climate model from #171 (a table row
  - an axis cut + cell entries). The 2-axis climate model itself landed early,
    in #171. Note [07](./strata-terrain-materials.md) adds a second cost: a new
    biome also needs layer-table entries, and would overflow its four-layer
    splat palette.
- More climate presets (eras / time-travel worlds) — additive once #172 gives
  worlds a preset reference.
