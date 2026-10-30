# Rust: Moving Hot Paths to WebAssembly

## Overview

Rewild does a lot of CPU work in web workers: terrain generation, scatter placement and BVH builds. On fast machines you do not notice it. On slower machines chunks arrive late and the world fills in visibly.

This milestone moves that work to Rust, compiled to WebAssembly (WASM). It starts with isolated modules. It then moves whole systems, so their data and their hot loops both live in Rust.

The first module, the BVH builder, has landed. This document records what we learnt from it, the rules we follow from now on, and the plan for the next systems.

Setup, build commands and how to add a module are in [wasm.md](../wasm.md).

## Goals

- Faster chunk generation, so the world fills in quickly on slow machines.
- Steadier frame times. A WASM build has a much smaller spread of times than the same JS (see the numbers below).
- One implementation for each system. After a port, the JS version is deleted.
- Use SIMD wherever it helps. We do not give up SIMD to match old JS output.
- Code that stays readable. Flat data formats hide behind named accessors, on both sides.

## Non-goals

- A port of the whole client to Rust. The UI, the WebGPU calls and the audio graph stay in TypeScript (see [What stays in TypeScript](#what-stays-in-typescript)).
- Threads inside WASM. They need `SharedArrayBuffer`, so the hosting must send COOP/COEP headers (see [Later](#later)).
- Compatibility with old saves. We have no customers yet, so a generator change can discard saved worlds.

## What we learnt

### Measure before you port

We built a benchmark (`npm run bench`) before any Rust. It showed that the largest waste was not the language. Each LOD build of a chunk generated the heights, splat and water again, although the chunk already held them.

We fixed that in TypeScript. A later LOD build fell from about 44 ms to between 0.06 ms and 5 ms. No port could have given that gain.

The rule: measure, then fix the algorithm, then port what is still hot.

### The BVH pilot

The Rust BVH builder replaced the JS builder in the BVH worker. It writes the existing flat node format directly, so it needs no tree of node objects and no separate serialize step.

| Terrain mesh | JS (median) | WASM (median) | Speedup | JS p95 | WASM p95 |
| ------------ | ----------- | ------------- | ------- | ------ | -------- |
| LOD 0        | 88.6 ms     | 29.2 ms       | 3.0x    | 143 ms | 30 ms    |
| LOD 1        | 20.2 ms     | 6.4 ms        | 3.2x    | 33 ms  | 6.5 ms   |

The JS builder was already well written: binned SAH and reused typed arrays. So this gain is a fair picture of the language difference, and it does not come from a better algorithm. The steadier p95 matters as much as the median. WASM has no garbage collector pauses in its hot loop.

Other facts from the pilot:

- The module is 33 KB.
- A first build takes about 30 seconds, because `wasm-pack` installs its tools. A build with no changes takes 0.5 seconds.
- One call does a whole job. Copying a 58,000-vertex mesh in and the tree out costs a fraction of a millisecond against 30 ms of work. Never call WASM once per triangle or once per sample.

### Why AssemblyScript failed and Rust should not

We removed AssemblyScript in March 2026. It had few learning resources, its community seemed inactive, and it meant a second copy of large parts of the engine.

Rust has a large WASM community and mature tools (`wasm-bindgen`, `wasm-pack`). We also use it differently: narrow crates for hot code, not a second engine. Rapier, our physics engine, is already Rust compiled to WASM.

### Testing

- We do not require WASM output to match JS output bit for bit. That rule would block SIMD, fused operations and better algorithms.
- We test the properties that matter instead. For the BVH: a valid tree, raycasts that hit at the same distance as a brute-force raycast, and SAH splits that beat midpoint splits.
- While a port is in progress, the JS version is the oracle. After it, a brute-force reference replaces it. For the BVH, that is a raycast that tests every triangle.
- `cargo test` covers the Rust logic. Jest specs cover the WASM boundary.

### Benchmark pitfalls

- Loading the WASM glue at the start of the benchmark made the JS BVH builder up to 70% slower in the same Node process. The benchmark now runs all JS cases first and loads WASM after them.
- Compare medians from the same machine. On a repeat run with no change, results agree within about 6%.

### Tooling

- macOS: Homebrew's `rustup` does not link `cargo` and `rustc`. Add `/opt/homebrew/opt/rustup/bin` to your `PATH`.
- Windows: Rust needs the Visual Studio C++ build tools for its linker.
- `wasm-pack` writes `rewild_wasm_bg.wasm.d.ts`. The build script deletes it, because TypeScript would use it for `import url from '...wasm'`.
- The Jest transform (esbuild) does not hoist `jest.mock`. Use `jest.spyOn`.

## Key decisions

| Decision                                             | Reason                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| WASM with SIMD is required. There is no JS fallback. | Every browser with WebGPU supports it, and we already require WebGPU. A fallback means two implementations to keep in step. |
| One implementation for each system.                  | The port compares against JS only while it is in progress. Then the JS is deleted.                                          |
| Old saves can be discarded.                          | No customers yet. This removes the need to match the old JS output.                                                         |
| SIMD is on (`+simd128`). Relaxed SIMD is off.        | Relaxed SIMD allows fused multiply-add, which can differ between machines.                                                  |
| One `.wasm` module for all workers.                  | One build, one loader. The file is small and the browser caches it. Split it only if it grows large.                        |
| Plain library crates, plus one output crate.         | Library crates have no JS types, so `cargo test` tests them directly. Only `rewild-wasm` knows about JS.                    |
| Data layouts are defined once, with named accessors. | No `nodes[i * 11 + 7]` in callers. In Rust a layout is a `#[repr(C)]` struct. In TypeScript it is a small class.            |
| JS owns chunk data. Rust borrows it for each call.   | See [Where chunk data lives](#where-chunk-data-lives).                                                                      |

## Where chunk data lives

Chunk heights, and later other chunk data, stay in JS typed arrays. A Rust function borrows them for one call:

```rust
#[wasm_bindgen]
pub fn sculpt_stamp(heights: &mut [f32] /* , brush */) { /* ... */ }
```

The `wasm-bindgen` glue copies the `Float32Array` into WASM memory, runs the function, and copies the result back into the same array. The TypeScript caller passes `chunk.heights` and keeps no other state.

Why JS owns the data:

- **The copies are cheap.** One chunk's heights are about 232 KB, and a copy of that size takes about 0.02 ms. A brush can pass only the window it touches.
- **WASM ownership would not remove most copies.** Each worker has its own WASM memory, so worker results reach the main thread's instance only by a copy. Rapier keeps its heightfield in its own WASM memory. GPU uploads copy too.
- **Views into growing WASM memory cause bugs.** When the memory grows, its old `ArrayBuffer` becomes detached, and every view over it reads as empty. JS code that keeps a view across a call that allocates breaks rarely, and far from the cause.
- **Most readers are in JS:** `sampleHeight`, snapshot saves, physics and the editing tools.

The general rule: data lives where its hot loop runs, and the boundary is crossed once per job, not once per item.

**When to change it.** Move the data into WASM when Rust does most of its reads and writes, or when the benchmark shows the copies cost a real share of a frame. Neither is true today.

**How to change it.** Use a fixed arena, not the growing WASM heap:

- At startup, reserve one region with a slot for each loaded chunk. 169 chunks at 232 KB each is about 39 MB.
- Set the memory's initial and maximum size, so it never grows after startup. Give the arena its own allocator.
- Without growth, views never detach, so JS can keep one `Float32Array` view for each slot.
- A chunk then owns a slot index, and `chunk.heights` becomes the view of its slot.

The cost is a fixed limit on loaded chunks. Do not build the arena until a measurement calls for it.

## Rules for a port

1. **Benchmark first.** Add the JS case to `bench/main.ts`, and look for algorithm waste before you port.
2. **Move a whole job per call,** and later a whole system, so its data stays on one side.
3. **Keep chunk results position-only.** A terrain sample must depend only on its world position, never on the chunk that computes it. With SIMD this means:
   - no relaxed SIMD
   - a fixed summation order for each sample
   - integer chunk coordinates, plus `f32` positions inside the chunk. Raw `f32` world coordinates lose precision far from the origin, and noise would show steps.
4. **Compare against the JS while you port.** Use invariants and tolerances, not bit equality. Then delete the JS.
5. **Add a seam test** for anything that generates chunk data. Shared edge samples of two neighbouring chunks must be exactly equal.
6. **Add a WASM case to the benchmark** next to the JS case, and record the speedup in the commit.

## Where we want to go

### Phase 0: Toolchain and pilot (done)

- Cargo workspace at `packages/rewild-wasm`, built by `npm run build:wasm`.
- `npm test` runs the Rust tests. CI installs Rust and `wasm-pack`.
- The benchmark, with JS and WASM cases.
- The BVH builder in Rust, used by the BVH worker.

### Phase 1: Require WASM (done)

- `Renderer.init` checks for WASM with SIMD before the WebGPU check, and fails the same way when it is missing.
- Load the module on the main thread too, so small synchronous BVH builds use Rust.
- Remove `BVHConfig.wasmWorkerBuilds` and the worker's JS fallback. Delete `BVHBuilder.ts`.
- Tests compare the BVH against a brute-force raycast.

### Phase 2: Terrain generation (done)

This is the largest win the player can see. Medians for one 241 × 241 chunk on a Ryzen 9 9950X3D:

| Stage                                 | JS          | Rust         | Notes              |
| ------------------------------------- | ----------- | ------------ | ------------------ |
| Heights (noise, biome blend, erosion) | 36 to 50 ms | 7 to 19 ms   | Every chunk, once. |
| Scatter placement                     | about 60 ms | 6 ms         | Near chunks, once. |
| Splat                                 | 15 to 22 ms | 5 ms         | Every chunk, once. |
| Mesh and normals                      | 0.1 to 6 ms | 0.02–0.7 ms  | Every LOD.         |
| Water map                             | 2.7 ms      | 0.4 ms       | Every chunk, once. |

A near chunk (LOD 0 with scatter) fell from about 125 ms to 20 ms, a far chunk from about 65 ms to 15 ms, and a later LOD of a chunk already built from 7.5 ms to 0.7 ms.

Heights cost what the ground is made of: a plains chunk takes 7 ms and a mountain chunk 19 ms, because the mountain biome sums 17 octaves and erodes.

The stages ported in the order heights, splat, water map, mesh, scatter, and the JS generator is deleted. `buildChunkMesh` still calls each stage on its own. Each call copies the heights across the boundary, which costs under 0.02 ms, so one call per chunk would save about 0.1 ms of a 15 ms build.

The `terrain` crate generates through one `TerrainGenerator` object per world, cached by climate, seed and sea level (`TerrainGenerator.ts`). The palette comes from `getClimatePalette`, so it has one source.

**Heights (done).** `generateBiomeBlendedHeightMap`, `createGroundSampler` and `sampleGround` keep their signatures and call Rust. The heights come back with lakes carved.

- Noise coordinates are `f64`. Field offsets reach ±100000 samples, where `f32` would lose detail in the finest octaves, more so far from the origin.
- Every field is evaluated from the world sample position, so neighbouring chunks agree bit for bit. `cargo test` checks both seams with erosion and a continent active.
- Thermal erosion runs as many passes as the most any biome asks for, over a margin of twice that. One pass reads two samples out, because a neighbour's move is shared over its own neighbours.
- A field runs every pass or none, so neighbouring chunks erode alike. It runs none when no biome that erodes is in reach of the field and its margin: the climate grid's node values bound every interpolated sample, so `reachable_biomes` lists every biome the field can hold. Nothing would move, so the result is the same, and a plains chunk skips the margin and the passes (9.4 ms to 6.8 ms).
- The climate fields (domain warp, temperature, moisture, continent) are evaluated on a world-aligned grid every 8 samples and interpolated. Their finest detail is hundreds of samples across, so the error stays under 0.001. Point queries interpolate the same nodes, so they match chunks exactly.
- Simplex runs two points per call with `f64x2` (`math::F64x2`, a plain pair natively). The octaves of a stack are independent, so they pair up; neighbouring samples are not paired, because they can blend different biomes. Each lane does the scalar code's operations in its order, so the output is bit-identical to the scalar path. The lattice lookups stay scalar, because WASM has no gather.
- Simplex with integer-hashed gradients in `f32x4`, with the skew done in `f64` so precision holds far from the origin, costs the same per point as the paired `f64` simplex in V8. Stacks of 5 or 6 octaves fill two 4-lane calls, so heights were about 26% slower with it, and it would have changed every world. The paired `f64` simplex stays.
- Each deformation's `curveExp` is read from a 4096-step table (`math::PowerCurve`) instead of `powf`, which is a software call in WASM. Heights move by at most 0.06 mm.
- On a Ryzen 9 9950X3D the heights stage fell from 36–50 ms to 10–11 ms.

**Splat (done).** `generateSplatMap` keeps its signature, its validation and its region repaint for the brush, and calls `SplatGenerator`. The `out` buffer is borrowed for the call, so a brush stroke still patches only its window.

- Biomes come from the same climate grid as the heights, so a material follows exactly the biome that shaped the ground.
- Layer compositing is `layer_weights`, unit tested in the crate. `LayerWeights.spec.ts` pins the shipped mountain table through the whole splat path.
- On the same machine splat fell from 15–22 ms to 4.9 ms, with a p95 within 5% of the median. The slope's `atan` costs under 1% of that.

**Water map and lakes (done).** Lakes moved with the water map, because the heights, the water map, scatter and the edit rules all read them. `buildWaterMap` and `resolveWater` keep their signatures and make one Rust call each. `findLakes` and `inspectLakeCells` return the lake records from Rust.

- `Lakes` (`lakes.rs`) finds, settles and carves lakes. It samples the Rust ground directly, so a chunk makes no WASM call per rim point. Cells hash as in `Hash.ts`, so lakes sit in the same cells as before.
- The ocean reads the continent from the same climate grid as the heights, so the water follows exactly the coast that shaped the ground.
- The chunk's water edit blends in Rust (`WaterEdit::apply`), passed as `WaterEditData`. The TS body records (`oceanBody`, `lakeBody`, `editedBody`) stay, because the edit rules build them too. The water map returns the first texel of each body for them.
- Scatter reads the same `WaterSampler` per candidate, inside Rust.
- `waterShowsAt` stays in TypeScript for the editing tools and mirrors `SWASH_REACH`.
- On the same machine the water map fell from 2.7 ms (0.77 ms with the JS warm) to 0.45 ms. Scatter fell from 62 ms to 57 ms.

**Mesh (done).** `generateTerrainMesh` calls `mesh::build` and returns the vertices, uvs, normals and indices the worker transfers. The interleaved buffer it wrote before, which `buildChunkMesh` then split into those arrays, is gone.

- The mesh reads only the heights and apron it is given, so it stays position-only through them. Its output matched the JS bit for bit, normals included, at every production LOD with and without the apron.
- `cargo test` checks the layout, winding, skirts, slope normals and shared edge normals between chunks and LODs.
- On the same machine the LOD 0 mesh fell from 5.9 ms to 0.74 ms, and a later LOD 0 build that reuses the heights from 7.5 ms to 0.70 ms. Most of the JS time was allocating the interleaved buffer and copying out of it, so the spread between p95 and minimum went from 7x to 1.4x.

**Scatter (done).** `scatterChunk` and `pickScatterInstance` keep their signatures. `scatterChunk` passes its masks, kills, region and water edit in a `ScatterRequestData` and makes one call to `ScatterGenerator`. The generator takes the scatter layer library at construction, in slot order, so a rule names its layer and a kill key its slot as before.

- Biomes come from the same climate grid as the heights and splat, and paint merges with them through `ActiveBiomes` (`paint.rs`), which the splat uses too. Scatter's noise selectors read the same simplex as the splat's layers.
- Against the JS, 61,487 of 61,489 instances over twelve chunks of both presets matched bit for bit in position, rotation, scale and phase. The other two swapped across a density threshold beside a biome border, where the grid moves the biome weights by its interpolation error.
- Rule density, the water conditions and kill keys are unit tested in the crate, with placement's purity, shared borders, regions, kills and paint. `Scatter.spec.ts` runs unchanged against the Rust placement through `scatterChunk`.
- Each layer returns its own arrays, because the worker transfers each layer's buffer.
- A candidate is accepted when its roll falls below its density, and no density exceeds the layer's densest rule unless paint raises it. A roll above that is rejected before anything is sampled, which skips about 80% of the 200,000 candidates in a default chunk with the same output.
- On the same machine scatter fell from 58 ms to 6 ms, with a p95 of 6.2 ms, from 68 ms.

**The horizon map and the biome probe (done).** `FarMapBuilder` (`HorizonOcean`'s far map) and `BiomeProbe` (the soundscape's biomes) call Rust, so the climate has one implementation, in the terrain crate.

- `FarMap` (`far.rs`) builds a few rows a call, as before, and reads the splat's rules with each noise selector at its mean coverage. A texel is dozens of samples across, so it evaluates the climate at its centre instead of interpolating four grid nodes. Heights differ from the interpolated ground by under one f16 step.
- `biomesAt` resolves one point, painted biomes included, the way a chunk does.
- A near far map rebuild fell from 51 ms to 18 ms, and a wide one from 16 ms to 5 ms. At the 1 ms frame budget a near rebuild now takes about 18 frames.

### Phase 3: The BVH system

1. Add benchmark cases for raycast (first hit and all hits), refit, and the main-thread deserialize.
2. Replace the `BVHNode` object tree with a flat tree behind a `BVHTree` accessor class. This removes the deserialize step and most of the BVH memory. Today terrain gets a BVH only at LOD 0 and 1, because object trees reached about 2.7 million nodes.
3. Move raycast and refit to Rust where the benchmark shows a gain.

### Phase 4: Editing on the main thread

Sculpt stamps (`Sculpt.ts`), splat repaint (`refreshChunkSplat`) and water carving run on the main thread while the user edits. They work over the same chunk data as Phase 2.

The Rust functions borrow the chunk data for each call (see [Where chunk data lives](#where-chunk-data-lives)). Benchmark the copies here. They decide whether the fixed arena is needed.

### Phase 5: Measure, then decide

These systems do real CPU work, but we have no numbers for them yet. Add benchmark cases first:

- Scatter culling and selection for each frame (`ChunkScatter`, `ScatterChunkLayer`).
- Placement that follows the ground (`ConformedPlacement`).
- Scatter collider streaming (`ScatterColliderStreamer`).

## What stays in TypeScript

Some systems gain nothing from WASM, or would get slower.

| System                                                       | Why it stays                                                                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI (`rewild-ui`, `src/ui`)                                   | It works with the DOM. WASM must call back into JS for every DOM change.                                                                           |
| WebGPU calls: encode, submit, pipelines, bind groups         | Every WebGPU call from WASM goes through a JS binding. The work is in the GPU driver, not in our code.                                             |
| Audio (`rewild-audio`, `src/core/audio`)                     | It builds a Web Audio graph. The browser does the signal processing. Custom DSP in an `AudioWorklet` could use WASM later, but we have none today. |
| Network, sync and storage (`src/api`, `src/database`)        | They wait for I/O, not the CPU.                                                                                                                    |
| Routing, game state and debug commands                       | Glue code. It is small, and it changes often.                                                                                                      |
| Input                                                        | Driven by browser events.                                                                                                                          |
| Small math helpers (`rewild-common/math`) one call at a time | A JS-to-WASM call for each `Vector3` operation costs more than the operation. Rust code uses its own math.                                         |
| Physics                                                      | It is already WASM (Rapier). We only feed it data.                                                                                                 |

Two systems are not in this list for now, but they could move later:

- **The scene graph and culling for each frame.** They are hot, but the code is built from JS objects that the rest of the engine uses. A port needs a data-oriented redesign first, for example a flat transform store. That is a separate milestone.
- **Work that belongs on the GPU instead.** Anything that only produces a texture, such as a splat map or an impostor bake, could move to a compute shader. Heights must stay on the CPU, because physics, raycasts and gameplay read them.

## Open questions

- **How many terrain workers?** The pool has at most 4. Faster builds may change the best number.
- **When to split the module?** One module is right while it is small. After Phase 2 it is 291 KB, 114 KB gzipped.
- **How to debug?** The Chrome "C/C++ DevTools Support (DWARF)" extension lets you step through Rust source. A debug build adds the source maps. Add an `npm run build:wasm:debug` when we first need it.

## Later

- **Threads.** WASM threads could build one chunk on several cores. They need `SharedArrayBuffer`, so every page must be served with COOP/COEP headers. Our Scaleway Object Storage bucket cannot send those by itself. We would need a CDN rule or a service worker. The worker pool already builds 4 chunks in parallel, so threads would mainly make a single chunk finish sooner.
- **A generator version.** When we have customers, a saved world must keep the generator it was made with. A generator change then needs a migration or a version check.
- **A new erosion model.** One implementation in Rust makes a heavier model affordable.

## Related docs

- [wasm.md](../wasm.md): setup, build commands and how to add a module.
- [bvh.md](../bvh.md): the BVH system.
- [Strata](strata.md): the terrain system.
- [Understory](understory.md): scatter and foliage.
- [monorepo-structure.md](../monorepo-structure.md): packages and build commands.
