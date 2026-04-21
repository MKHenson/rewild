# RE-WILD

- RE-WILD is a browser-based 3D game & 3D engine. It features a built-in level editor, custom UI and custom rendering engine using WebGPU.
- **Custom UI framework** instead of React/Vue — lightweight web components with signals-like reactivity. Please see ./docs/ui.md for more if you need to work with the UI
- **WebGPU** — modern GPU API with WGSL shaders and `#include` preprocessing. See more in ./docs/renderer.md for more info
- **esbuild** instead of webpack — fast builds with custom WGSL/WASM loaders. See more in in ./docs/monorepo-structure.md on how to build/test
- **Dual database** — (online database not decided yet) + IndexedDB (offline) with shared interface
