### Working with the renderer

The renderer lives in `packages/rewild-renderer`. WGSL shader files support `#include "path"` directives processed at build time by the esbuild plugin. The `GameManager` in `src/core/GameManager.ts` orchestrates the renderer, physics, and input.

### PBR reference harness (console)

Registered in `src/core/debug/PbrHarnessCommands.ts`. Shading has too many places to hide a
mistake — a mis-declared colour space, a flipped normal-map green channel and a roughness map that
never loaded all present as "it looks a bit off". These turn that into something measurable.

```js
setMaterialChannel('roughness'); // basecolor|metallic|roughness|normal|ao|emissive|direct|indirect
setMaterialChannel('off'); // back to normal shading

showPbrReferenceGrid(); // 7 roughness steps x 3 metallic rows of spheres, 14m ahead
hidePbrReferenceGrid();

setExposure(0.06); // linear multiplier, not EV stops — see Camera.exposure
```

`setMaterialChannel` covers the standard material, its instanced variant **and terrain**, so the
same channel can be compared across all three. Two of the channels are outputs rather than inputs:
`direct` and `indirect` split the shaded result by light source, which is the fastest way to tell a
sun problem from a sky one. Input channels are 0–1 quantities pre-divided by exposure so the frame
tonemap passes them through rather than crushing them; the output channels are left on the scene's
own scale so they can be compared against the final image.

Reading the grid: the highlight should tighten and brighten toward roughness 0 **without the
sphere gaining total energy**, the metal row should take its colour from what it reflects rather
than its albedo, and no sphere should go black at its rim — that rim is IBL.

The metal row is the sensitive one, because a metal has no diffuse lobe to hide an energy error
behind. It found the first real defect: rough metals were going dark because the split-sum BRDF
only counts a single bounce off a microfacet, and at high roughness most light bounces several
times before leaving. `evaluateIbl` now adds Fdez-Agüera's multiple-scattering compensation, which
returns that energy. If the right-hand end of the metal row ever goes dark again, that term is the
first thing to check.

### Key documents

- BVH: The Bounding Volume Hierarchy. Used to speed up culling, picking and scene queries. See [bvh.md](./bvh.md) for more
- Sky rendering: Multi-pass rendering of sky, atmosphere and weather. Please read [sky-rendering.md](./sky-rendering.md)
- Weather system: Dynamic weather including precipitation, lightning and overcast sky response. See [weather.md](./weather.md)
