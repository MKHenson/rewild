### Working with the renderer

The renderer lives in `packages/rewild-renderer`. WGSL shader files support `#include "path"` directives processed at build time by the esbuild plugin. The `GameManager` in `src/core/GameManager.ts` orchestrates the renderer, physics, and input.

### Key documents

- BVH: The Bounding Volume Hierarchy. Used to speed up culling, picking and scene queries. See [bvh.md](./bvh.md) for more
- Sky rendering: Multi-pass rendering of sky, atmosphere and weather. Please read [sky-rendering.md](./sky-rendering.md)
- Weather system: Dynamic weather including precipitation, lightning and overcast sky response. See [weather.md](./weather.md)
- Materials & shading: The PBR material model, colour spaces, exposure and sky-driven ambient. See [lichen.md](./milestones/lichen.md)
- Debugging: Every console command the engine registers — material channels, the PBR reference grid, IBL viewer, shadow and perf capture. See [debug-commands.md](./debug-commands.md)
