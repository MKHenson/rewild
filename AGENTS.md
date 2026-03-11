# RE-WILD — AI Agent Instructions

RE-WILD is a browser-based 3D game about time travel, exploration, natural history, and saving the planet. It features a built-in level editor, Firebase backend, and custom rendering engine using WebGPU.

**Demo:** https://rewild-96f5b.web.app/

## Tech Stack

| Layer        | Technology                                                           |
| ------------ | -------------------------------------------------------------------- |
| Language     | TypeScript 5.9+ (strict mode, ESNext target)                         |
| UI Framework | **Custom web components with custom JSX** (NOT React)                |
| 3D Rendering | WebGPU with WGSL shaders (custom engine in `rewild-renderer`)        |
| Physics      | Rapier 3D (`@dimforge/rapier3d-compat`)                              |
| Backend      | Firebase (Auth, Firestore, Functions, Hosting, Storage)              |
| Build        | esbuild with custom plugins                                          |
| Test         | Jest 29 with jsdom + esbuild transform                               |
| Monorepo     | npm workspaces                                                       |
| Node         | 22+ (enforced via `.nvmrc`, `.npmrc engine-strict`, `engines` field) |
| CI/CD        | GitHub Actions → Firebase Hosting on merge to `main`                 |

## Critical: Custom JSX System (NOT React)

This is the most important thing to understand. The JSX in this project is **not React**.

- `tsconfig.base.json` sets `"jsxFactory": "jsx"` — this calls `window.jsx()` defined in `rewild-ui/compiler/jsx.tsx`
- Components extend `HTMLElement` via `Component<T>` base class
- Components are registered as Custom Elements with the `@register('x-tag-name')` decorator
- There is **no virtual DOM**, no `React.createElement`, no `useState` from React
- The `useState` here is a custom hook on `Component` that returns a getter function and setter
- Styles use adopted stylesheets via the `getStyle()` method and `css` tagged template literal

### Component Pattern

```tsx
import { Component, register, jsx, css } from 'rewild-ui';

interface Props {
  title: string;
}

@register('x-my-component')
export class MyComponent extends Component<Props> {
  init() {
    const [count, setCount] = this.useState(0);

    // Return a render function
    return () => (
      <div>
        <h1>{this.props.title}</h1>
        <span>{count()}</span>
        <button onClick={() => setCount((c) => c + 1)}>+</button>
      </div>
    );
  }

  getStyle() {
    return css`
      div {
        padding: 8px;
      }
    `;
  }
}
```

### Component Lifecycle

1. `constructor()` — Do not override; setup happens in `init()`
2. `init()` — **Abstract**. Set up state, subscriptions, return render function
3. `connectedCallback()` — Applies CSS, calls render, then `onMount?.()`
4. `disconnectedCallback()` — Calls `onCleanup?.()`, unsubscribes stores, removes stylesheets

### Store Pattern

Stores extend `Store<T>` from `rewild-ui`. State is mutated via `this.defaultProxy.property = value` which auto-notifies subscribers. Stores are exported as singletons.

```ts
import { Store } from 'rewild-ui';

interface IMyState {
  items: string[];
  loading: boolean;
}

export class MyStore extends Store<IMyState> {
  constructor() {
    super({ items: [], loading: false });
  }

  async fetchItems() {
    this.defaultProxy.loading = true;
    this.defaultProxy.items = await api.getItems();
    this.defaultProxy.loading = false;
  }
}

export const myStore = new MyStore();
```

Components subscribe with `this.observeStore(store, callback?)`.

### Routing

Routes are defined declaratively in JSX using `RouterSwitch` and `Route` from `rewild-ui`. Navigation uses `navigate('/path')`. Route params use `:param` syntax.

```tsx
<RouterSwitch>
  <Route path="/" onRender={() => <MainMenu />} />
  <Route path="/game" onRender={() => <InGame />} />
  <Route path="/editor" onRender={() => <ProjectEditorPage />} />
</RouterSwitch>
```

## Monorepo Structure

```
rewild/
├── src/                          # Main app source (entry: src/index.tsx)
│   ├── api/                      # Firebase API calls (projects, levels)
│   ├── core/                     # GameManager, Clock, GameLoader, routing/behaviours
│   ├── database/                 # DB abstraction (Firestore + IndexedDB offline)
│   ├── types/                    # models.d.ts, style.d.ts
│   └── ui/
│       ├── application/          # Top-level screens (MainMenu, InGame, Auth, Editor)
│       │   └── project-editor/   # Level editor UI
│       ├── stores/               # Global state (Auth, Projects, Actors, SceneGraph, etc.)
│       └── utils/
├── packages/
│   ├── rewild-ui/                # Custom web component framework + JSX compiler
│   ├── rewild-routing/           # Game state machine
│   ├── rewild-common/            # Shared types, AssemblyScript polyfills, enums
│   └── rewild-renderer/          # WebGPU rendering engine (shaders, materials, geometry)
├── public/                       # Build output (served by live-server)
├── functions/                    # Firebase Cloud Functions (Node 16+)
├── server/                       # GraphQL server (Express + PostgreSQL)
├── static/                       # Font assets (copied to public/ on build)
├── templates/                    # JSON templates: actors, materials, geometries
├── esbuild.js                    # Build config with WGSL + copy plugins
└── firebase.json                 # Firebase project config (rewild-96f5b)
```

### Package Roles

| Package           | Purpose                                                                                      | Key Exports                                                               |
| ----------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `rewild-ui`       | Web component framework, JSX compiler, base `Component` & `Store` classes, 30+ UI components | `Component`, `Store`, `register`, `jsx`, `css`, `navigate`, UI components |
| `rewild-renderer` | WebGPU 3D engine: shaders, materials, textures, geometry, input                              | `Renderer`, cameras, materials, shader system                             |
| `rewild-common`   | Shared constants, AssemblyScript type stubs, event dispatcher, GPU enums                     | `Dispatcher`, `setupGlobalPolyfill`, enums                                |
| `rewild-routing`  | Game state machine and routing types                                                         | State machine infrastructure                                              |

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

## TypeScript Configuration

- **Strict mode** with `noImplicitReturns`, `noUnusedLocals`, `noFallthroughCasesInSwitch`
- **`strictPropertyInitialization: false`** — required for the decorator-based component system
- **Decorators:** `experimentalDecorators: true`, `emitDecoratorMetadata: true`
- **`useDefineForClassFields: false`** — required for decorator compatibility
- **JSX:** `"jsx": "react"` with `"jsxFactory": "jsx"` (custom, not React)
- **Paths:** `"models"` → `./types/models.d.ts`; `"*"` includes `/build/types.d.ts`
- **baseUrl:** `"../"` (from `src/tsconfig.json`, relative to workspace root)

### Global Type Declarations

- `types.d.ts` — AssemblyScript numeric types (`i8`, `i32`, `f32`, `f64`, `bool`, `Mathf`, `unchecked`)
- `files.d.ts` — `.wasm` module declaration

## Naming Conventions

| Element            | Convention                            | Example                                        |
| ------------------ | ------------------------------------- | ---------------------------------------------- |
| Components         | PascalCase file + class               | `ProjectSelector.tsx`, `class ProjectSelector` |
| Web component tags | kebab-case with `x-` prefix           | `@register('x-project-selector')`              |
| Stores             | PascalCase class, camelCase singleton | `class AuthStore` → `export const authStore`   |
| Utility files      | camelCase                             | `exportHelper.ts`                              |
| Directories        | camelCase or kebab-case               | `project-editor/`, `stores/`                   |
| Interfaces/Types   | `I` prefix for store state interfaces | `IAuth`, `IProjectStore`                       |

## Formatting

Prettier config (`.prettierrc`):

- 2-space indent, semicolons, single quotes, trailing commas (es5), 80 char width, JSX bracket same line

## Firebase Services

| Service   | Usage                                                                         |
| --------- | ----------------------------------------------------------------------------- |
| Auth      | Email/password authentication                                                 |
| Firestore | Projects and levels storage (collections: `projects`, `levels`)               |
| Hosting   | Static site deployment (`public/` dir)                                        |
| Storage   | Media assets (GCS bucket: `rewild-6809`)                                      |
| Functions | Server-side logic (Node 16+, TypeScript)                                      |
| Emulators | Local dev: Functions(:5002), Firestore(:8080), Hosting(:5003), Storage(:9199) |

## Key Architecture Decisions

1. **Custom UI framework** instead of React/Vue — lightweight web components with signals-like reactivity
2. **WebGPU** instead of WebGL — modern GPU API with WGSL shaders and `#include` preprocessing
3. **esbuild** instead of webpack — fast builds with custom WGSL/WASM loaders
4. **AssemblyScript compatibility** — type stubs (`i32`, `f32`, etc.) allow sharing code with potential AS modules
5. **Firebase-first backend** — Firestore for data, GCS for media, Functions for server logic
6. **Dual database** — Firestore (online) + IndexedDB (offline) with shared interface
7. **Handle-based IDs** — Firestore document IDs used throughout (no sequential IDs)

## Common Tasks

### Adding a new UI component

1. Create `MyComponent.tsx` in the appropriate `ui/` subdirectory
2. Import `Component`, `register`, `jsx`, `css` from `rewild-ui`
3. Decorate with `@register('x-my-component')`
4. Extend `Component<Props>` and implement `init()` returning a render function
5. Optionally implement `getStyle()` for scoped CSS

### Adding a new store

1. Create `MyStore.ts` in `src/ui/stores/`
2. Define state interface (e.g., `IMyState`)
3. Extend `Store<IMyState>` with initial state in `super()`
4. Add methods that mutate `this.defaultProxy`
5. Export singleton: `export const myStore = new MyStore()`

### Adding a new route

Add a `<Route>` inside the `<RouterSwitch>` in `Application.tsx`:

```tsx
<Route path="/my-path" onRender={(params) => <MyPage />} />
```

### Working with the renderer

The renderer lives in `packages/rewild-renderer`. WGSL shader files support `#include "path"` directives processed at build time by the esbuild plugin. The `GameManager` in `src/core/GameManager.ts` orchestrates the renderer, physics, and input.

## Multi-Root Workspace Context

This VS Code workspace also contains:

- **`three.js/`** — Three.js 3D library (reference, not a direct dependency)
- **`rapier/`** — Rapier physics engine source (Rust). The JS binding `@dimforge/rapier3d-compat` is used in rewild
- **`loaders.gl/`** — loaders.gl source. The npm packages `@loaders.gl/core` and `@loaders.gl/gltf` are used in rewild

When working on rewild, changes to these sibling projects are not typical — they serve as reference codebases.
