# RE-WILD

- RE-WILD is a browser-based 3D game & 3D engine. It features a built-in level editor, custom UI and custom rendering engine using WebGPU.
- **Custom UI framework** instead of React/Vue — lightweight web components with signals-like reactivity. Please see ./docs/ui.md for more if you need to work with the UI
- **WebGPU** — modern GPU API with WGSL shaders and `#include` preprocessing. See more in ./docs/renderer.md for more info
- **esbuild** instead of webpack — fast builds with custom WGSL/WASM loaders. See more in in ./docs/monorepo-structure.md on how to build/test
- **Dual database** - [Server & Sync Architecture](./docs/milestones/mycelium-network.md)

# Some key points for an LLM

- Comments _must_ be to the point and only about the code. Do _NOT_ reference issues, chats or documents. The comment should be clear, concise and the focus is on what its for & how to use it. DO NOT BE VERBOSE
- **Do not launch, serve or browser-automate the app to verify changes.** The user runs it in the browser themselves. Verify with `npm run ts-check`, `npx jest` and `node ./esbuild.js`, then hand over for visual checking.
