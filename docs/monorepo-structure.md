## Monorepo Structure

### Package Roles

| Package           | Purpose                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `rewild-ui`       | Web component framework, JSX compiler, base `Component` & `Store` classes |
| `rewild-renderer` | WebGPU 3D engine: shaders, materials, textures, geometry, input           |
| `rewild-common`   | Shared constants, event dispatcher, enums                                 |
| `rewild-routing`  | Game state machine and routing types                                      |

## Build & Dev Commands

```bash
npm run start          # Dev: live-server(:9001) + esbuild watch + TS type-checking
npm run build          # Prod: clean → esbuild → tsc --noEmit
npm run watch          # esbuild watch only
npm run server         # live-server on :9001
npm run test           # Jest (root + all workspaces)
npm run unit-tests     # Jest (root only)
npm run ts-check       # TypeScript type-check only
npm run clean          # rimraf public/
```

### Build Details

- **Entry points:** `src/index.tsx` (main), `rewild-renderer/.../TerrainWorker.ts` (web worker)
- **Loaders:** `.wgsl` → text, `.wasm` → file
- **Custom plugin:** `wgslInlineIncludePlugin` processes `#include` directives in WGSL shader files
- **Assets copied:** `style.css`, `index.html`, `templates/**`, `static/**` → `public/`
- **Environment:** `MEDIA_URL` = `https://storage.googleapis.com/rewild-6809/`
- **Output:** `public/` directory (Firebase Hosting root)

## Testing

- **Framework:** Jest 29 with jsdom environment
- **Transform:** esbuild (via `jest.transform.cjs`) — no Babel
- **Setup:** `jest.setup.js` runs `setupGlobalPolyfill(global)` for AssemblyScript types
- **Pattern:** `src/**/*+(spec|test).[jt]s?(x)`
- **Workspace tests:** Each package may have its own tests run via `npm run test --workspaces`

## Tech Stack

| Layer        | Technology                                                           |
| ------------ | -------------------------------------------------------------------- |
| Language     | TypeScript 5.9+ (strict mode, ESNext target)                         |
| UI Framework | **Custom web components with custom JSX** (NOT React)                |
| 3D Rendering | WebGPU with WGSL shaders (custom engine in `rewild-renderer`)        |
| Physics      | Rapier 3D (`@dimforge/rapier3d-compat`)                              |
| Backend      | Firebase (Auth, Firestore, Functions, Hosting, Storage)              |
| Build        | esbuild with custom plugins                                          |
| Test         | Jest with jsdom + esbuild transform                                  |
| Monorepo     | npm workspaces                                                       |
| Node         | 22+ (enforced via `.nvmrc`, `.npmrc engine-strict`, `engines` field) |
| CI/CD        | GitHub Actions → Firebase Hosting on merge to `main`                 |

## Multi-Root Workspace Context

This VS Code workspace also contains:

- **`three.js/`** — Three.js 3D library (reference, not a direct dependency)
- **`rapier/`** — Rapier physics engine source (Rust). The JS binding `@dimforge/rapier3d-compat` is used in rewild
- **`loaders.gl/`** — loaders.gl source. The npm packages `@loaders.gl/core` and `@loaders.gl/gltf` are used in rewild

When working on rewild, changes to these sibling projects are not typical — they serve as reference codebases.
