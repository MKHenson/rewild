![Water](../images/rust.jpg)

# Rust

Rewild's heaviest CPU work is written in Rust and compiled to WebAssembly (WASM). Terrain, scatter,
the BVH and the editing brushes all run this way, in the workers and on the main thread. This page
explains what runs in Rust, how to build it, and how to call it or add to it.

---

## The short version

- **One WASM module** holds all the Rust code. The main thread and every worker load their own copy.
- **WASM with SIMD is required.** The renderer checks for it at start-up, next to WebGPU. There is
  no JavaScript fallback.
- **TypeScript calls Rust through small wrappers**, which keep their normal TypeScript signatures.
  Most callers never see Rust at all.
- **One call does a whole job**, such as one chunk's heights or one brush stamp. Never call it once
  per sample or per triangle.
- **Chunk data stays in JavaScript.** A Rust function borrows an array for one call and writes its
  result back into it.
- **`npm run bench`** measures the hot code, so you can see what a change does to it.

---

## What runs in Rust

| System             | What it does                                           | TypeScript entry points                                                |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Terrain heights    | Noise, biome blending, erosion and lakes for a chunk   | `generateBiomeBlendedHeightMap`, `createGroundSampler`                 |
| Splat maps         | Which ground materials show where                      | `generateSplatMap`                                                     |
| Water maps         | Oceans, lakes and water edits over a chunk             | `buildWaterMap`, `resolveWater`, `findLakes`                           |
| Chunk meshes       | Vertices, normals and skirts for each detail level     | `generateTerrainMesh`                                                  |
| Scatter placement  | Where each plant and stone grows                       | `scatterChunk`, `pickScatterInstance`                                  |
| Horizon and biomes | The far ocean map and the biomes at a point            | `FarMapBuilder`, `BiomeProbe`                                          |
| BVH                | Building and refitting the trees that raycasts use     | `buildBVHWasm`, `refitBVHWasm`, `new BVH()`                            |
| Brush edits        | Sculpt stamps, and the water brush's bed, lip and bank | `applySculptStamp`, `applyCarveStamp`, `applyWaterLip`, `applyCutBank` |

Compared with the JavaScript they replaced, these run about 3 to 16 times faster, and their timing
varies much less from run to run, so frame times stay steady.

### What stays in TypeScript

Code that mostly talks to the browser stays in TypeScript, because every call from WASM back into
JavaScript costs time:

- The UI, WebGPU calls, audio, input, networking and storage.
- Small math helpers such as `Vector3`. A call into WASM costs more than the sum itself.
- Per-frame scene work, such as scatter culling and raycasts against a built BVH. They read
  thousands of small JavaScript objects, so they would need a different data layout first.

Physics is already WASM: Rapier is a Rust library.

---

## Set up

You need Rust, the `wasm32-unknown-unknown` target and `wasm-pack`.

**macOS**

```sh
brew install rustup wasm-pack
rustup-init
rustup target add wasm32-unknown-unknown
```

Homebrew does not put the Rust commands on your `PATH`. Add this line to `~/.zshrc`, then open a new
terminal:

```sh
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"
```

**Windows**

1. Install Visual Studio Build Tools with the "Desktop development with C++" workload. Rust uses its
   linker.
2. Run `rustup-init.exe` from https://rustup.rs and accept the default toolchain.
3. In a new terminal:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

Check it worked with `rustc --version`, `cargo --version` and `wasm-pack --version`.

---

## Build, test and benchmark

Run these from the repo root.

| Command              | What it does                                                                |
| -------------------- | --------------------------------------------------------------------------- |
| `npm run build:wasm` | Builds the module into `packages/rewild-wasm/pkg/`.                         |
| `npm run test:wasm`  | Runs the Rust tests.                                                        |
| `npm test`           | Builds the module, then runs the Rust tests and the JavaScript tests.       |
| `npm run bench`      | Benchmarks the terrain, BVH, scatter and editing code.                      |
| `npm run bench:game` | Benchmarks the game's main-thread systems, such as colliders and placement. |

`npm run build` and `npm start` build the module first. A build with no changes takes under a
second. The first build takes about 30 seconds while `wasm-pack` installs its tools.

**Watch mode does not watch Rust.** After you change Rust code, run `npm run build:wasm`.

The benchmark takes a few options:

```sh
npm run bench -- --filter "sculpt"                  # only cases whose name contains "sculpt"
npm run bench -- --runs 30 --warmup 5
npm run bench -- --json bench-results/before.json   # save the results
npm run bench -- --compare bench-results/before.json # show the speedup against them
```

Compare results from the same machine only. A repeat run with no change agrees within about 6%.

---

## Using it from TypeScript

### Loading the module

`Renderer.init` loads the module on the main thread, so after start-up you can call any wrapper.

A worker loads its own copy once, and waits for it before its first job:

```ts
import wasmUrl from '../../../../../rewild-wasm/pkg/rewild_wasm_bg.wasm';
import { loadRewildWasm } from '../../../wasm/RewildWasm';

const wasmReady = loadRewildWasm(wasmUrl);

self.onmessage = async (event) => {
  await wasmReady;
  // ... call the wrappers
};
```

Node scripts load it from the file. Jest does this for every spec in `jest.setup.js`, so specs can
call Rust directly.

```ts
import { readFileSync } from 'node:fs';
import { loadRewildWasmSync } from '../lib/wasm/RewildWasm';

loadRewildWasmSync(
  readFileSync('packages/rewild-wasm/pkg/rewild_wasm_bg.wasm')
);
```

### Calling it

The wrappers are ordinary functions. For example:

```ts
// One chunk's heights, 241 × 241 samples.
const heights = generateBiomeBlendedHeightMap(
  241,
  241,
  seed,
  new Vector2(0, 0),
  climate
);

// A BVH over a mesh.
const { nodes, triIndices } = buildBVHWasm(
  geometry.vertices,
  geometry.indices,
  {
    strategy: 'sah',
    maxDepth: 40,
    maxLeafTriangles: 4,
  }
);

// A sculpt stamp. It edits the chunks' heights in place and returns the chunks it changed.
const touched = applySculptStamp(source, {
  type: 'raise',
  centerX: point.x,
  centerZ: point.z,
  radius: 20,
  amount: 0.5,
});
for (const t of touched) terrain.remeshChunk(t.cx, t.cy);
```

---

## Adding Rust code

The code lives in `packages/rewild-wasm`:

| Path                  | What it holds                                                            |
| --------------------- | ------------------------------------------------------------------------ |
| `crates/math/`        | Shared math: noise, random numbers, hashes and interpolation.            |
| `crates/bvh/`         | The BVH builder and refit.                                               |
| `crates/terrain/`     | Heights, lakes, splat, water, meshes, scatter, far maps and brush edits. |
| `crates/rewild-wasm/` | The only crate that knows about JavaScript. It exposes the others.       |
| `pkg/`                | The built module. Generated, not in git.                                 |

The steps, with a made-up example that scales a chunk's heights:

**1. Write plain Rust in a library crate**, with no JavaScript types, so `cargo test` can test it.

```rust
// crates/terrain/src/scale.rs
pub fn scale(heights: &mut [f32], factor: f32) {
    for h in heights.iter_mut() {
        *h *= factor;
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn doubles() {
        let mut heights = [1.0, 2.0];
        super::scale(&mut heights, 2.0);
        assert_eq!(heights, [2.0, 4.0]);
    }
}
```

To add a new crate, create its folder under `crates/` with a `Cargo.toml`. The workspace finds it.

**2. Expose it in `crates/rewild-wasm/src/lib.rs`.**

```rust
#[wasm_bindgen(js_name = scaleHeights)]
pub fn scale_heights(heights: &mut [f32], factor: f32) {
    terrain::scale::scale(heights, factor);
}
```

A `&mut [f32]` argument takes a `Float32Array`. It is copied into WASM, edited, and copied back into
the same array. A `Vec<f32>` result comes back as a new `Float32Array`. A result with several arrays
is a `#[wasm_bindgen]` struct with a `take...` method for each, which the caller frees with
`free()` (see `buildBVHWasm`).

**3. Wrap it in TypeScript**, so callers keep a normal signature.

```ts
import { scaleHeights } from '../../../../rewild-wasm/pkg/rewild_wasm';

/** Multiplies a chunk's heights by `factor`, in place. */
export function scaleChunkHeights(heights: Float32Array, factor: number): void {
  scaleHeights(heights, factor);
}
```

**4. Test it.** `cargo test` covers the Rust. A Jest spec checks the wrapper against a simple
reference, such as a brute-force raycast for the BVH. Test the properties that matter, not exact
bit-for-bit output, so the Rust is free to use SIMD or a better algorithm.

**5. Benchmark it.** Add a case to `packages/rewild-renderer/bench/main.ts`.

---

## Rules of thumb

- **Do a whole job per call.** Copying data across costs a fraction of a millisecond per job. Paid
  per item, it would cost more than the work.
- **Pass only what the job needs.** A brush passes the samples under it, not the whole chunk.
- **Chunk results must depend only on world position.** Neighbouring chunks must agree exactly on
  their shared edges, or the terrain shows seams. Add a test that compares the shared edge of two
  chunks.
- **Do not keep a view into WASM memory.** When the memory grows, old views read as empty. Pass
  arrays in and get arrays out.
- **Avoid `f32::min`, `f32::max` and `clamp` in hot loops.** They are slow on x64. Use
  `math::fast_min` and `math::fast_max` on values that cannot be NaN.
- **Avoid `powf`, `sin`, `tan` and friends in hot loops.** WASM has no instruction for them. Work
  them out once per job, use `powi`, or read a table such as `math::PowerCurve`.
- **Measure before you optimise.** Check the benchmark on both x64 and ARM if you can.

---

## Troubleshooting

- **TypeScript cannot find a new function.** Run `npm run build:wasm`. The `pkg/` types come from the
  build.
- **A worker throws on its first job.** It called Rust before `await wasmReady`.
- **`jest.mock` does not work.** The Jest transform does not hoist it. Use `jest.spyOn`, or pass the
  dependency in.
- **macOS cannot find `cargo`.** Add `/opt/homebrew/opt/rustup/bin` to your `PATH` (see
  [Set up](#set-up)).
- **Windows fails to link.** Install the Visual Studio C++ build tools.
- **Stepping through Rust.** The Chrome "C/C++ DevTools Support (DWARF)" extension can step through
  Rust source in a debug build.

---

## Related docs

- [Terrain (Strata)](strata.md): the terrain the Rust code generates.
- [Foliage & Scatter (Understory)](understory.md): scatter and foliage.
- [BVH](../bvh.md): the BVH system.
- [Monorepo structure](../monorepo-structure.md): packages and build commands.
