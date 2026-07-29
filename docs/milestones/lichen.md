![Lichen](../images/lichen.jpg)

# Lichen — Physically Based Materials & Shading

> Successor to **Foxfire**. Where Foxfire decided how the world is _lit_, _Lichen_ — the
> fungus-and-alga symbiosis that colonises bare rock and gives a dead surface its first
> character — decides what the light actually _lands on_.

## Overview

Rewild currently has two shading models, both non-physical: **Lambert** diffuse
(`shader-lib/total-lighting.frag.wgsl`) and **Phong** specular
(`shader-lib/total-lighting-phong.frag.wgsl`), with a **flat constant ambient term** added at the
end (`lambertParams.ambientColor`, `phongParams.ambientColor`). Light `intensity` is a unitless
`f32` (`core/lights/Light.ts`) and point/spot attenuation is a linear `1 - dist/range` ramp.

More consequentially, the renderer is **split across two different colour pipelines**:

- The **sky, cloud, fog, bloom and god-ray path is fully HDR** — `rgba16float` throughout, with
  ACES tonemapping and pre-tonemap bloom in `shaders/sky/skyComposite.wgsl`.
- The **main scene pass is LDR** — terrain and meshes render directly into
  `presentationFormat` (an 8-bit `bgra8unorm` swapchain; see `Renderer.ts`).
- They meet at the composite, where the sky tonemaps **only its own contribution** and
  src-alpha blends over already-shaded terrain. **Terrain is never tonemapped.**

Separately, all textures load as `rgba8unorm` and never `rgba8unorm-srgb`
(`textures/BitmapTexture.ts`), so sRGB-encoded albedo is sampled as though it were linear — and
mipmaps are averaged in that same wrong space by `shaders/mipmap-generator.wgsl`.

Lichen replaces both shading models with a single **metallic-roughness PBR** model, moves the
scene pass into HDR so physical light values survive to the tonemapper, and replaces the flat
ambient constant with **image-based lighting captured from the sky system we already have**.

**Why this milestone comes before objects.** The material system sits _below_ objects in the
dependency stack. Building Understory's instancing, LOD and scatter against Lambert would mean
rewriting all of it when PBR lands. And glTF's material model _is_ metallic-roughness — importing
models into a Lambert pipeline discards everything the artist authored.

---

## Goals

- **One HDR scene pipeline.** Scene pass renders `rgba16float`; a single whole-frame ACES
  tonemap replaces the sky pass's isolated tonemapping. Terrain gets tonemapped for the first time.
- **Colour-space correctness.** sRGB textures declared as sRGB, data maps (normal, roughness,
  metallic, AO) declared linear, mip generation in linear space.
- **Meaningful light units** — inverse-square falloff with a smooth range window, anchored to the
  sky's existing radiance scale, plus a single camera **exposure** scalar.
- **A `StandardPass` metallic-roughness material** — GGX specular, Smith visibility, Schlick
  Fresnel — matching the glTF material spec so imported materials render as authored.
- **Sky-driven IBL.** Capture the existing atmosphere to a cubemap, prefilter it, and use it for
  diffuse and specular ambient. Ambient then tracks time of day and weather **for free**.
- **Terrain adopts PBR** by swapping its shader include — the whole world benefits, not just
  future objects.
- A **PBR reference harness** (metallic × roughness sphere grid) so correctness is measured
  rather than eyeballed.

## Non-goals (deferred)

- **The glTF mesh loader** — node hierarchy, multi-primitive, tangents. That's **Understory**.
  Lichen defines the material model _to glTF's spec_ and proves it with hand-authored
  `materials.json` entries plus a few Blender-exported test meshes; Understory wires the importer
  up to create those materials automatically. See [Scope boundary](#scope-boundary-with-understory).
- **Local / dynamic reflection probes.** Sky IBL covers an outdoor natural world. Probes are an
  interiors-and-cities feature; revisit when there are interiors.
- **Screen-space reflections**, and **global illumination** of any kind (lightmaps, GI probes,
  irradiance volumes).
- **Advanced glTF material extensions** — clearcoat, sheen, transmission, anisotropy, iridescence,
  subsurface scattering. Core metallic-roughness only.
- **Area lights.** Punctual lights only, as in Foxfire.
- **Texture compression codecs** — KTX2/basisu, Draco, meshopt. Models are Blender-authored with
  export settings we control, so these buy nothing yet.
- **Skinned/animated materials.** That's **Sinew**, two milestones out.

---

## Key technical decisions

| Decision            | Choice                                                             | Why                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shading model       | **Metallic-roughness** (not specular-glossiness)                   | It's what glTF authors, what Blender exports, and one fewer texture than spec-gloss.                                                                                                                                          |
| Specular BRDF       | **GGX + Smith height-correlated + Schlick Fresnel**                | The industry-standard combination; a handful of extra ALU over Phong.                                                                                                                                                         |
| Diffuse BRDF        | **Lambert**                                                        | Burley/Oren-Nayar is a marginal gain at real cost. Keep it cheap; revisit never.                                                                                                                                              |
| Scene colour target | **`rgba16float`**                                                  | Physical light values exceed 1.0. 8-bit clips them at source, so specular and IBL white out.                                                                                                                                  |
| Tonemapping         | **Single whole-frame ACES**, moved out of the sky composite        | One curve over the whole image. Two tonemapping regimes meeting at a blend cannot be made consistent.                                                                                                                         |
| Light units         | **Sky-anchored relative**, with inverse-square + range window      | Full photometric units (lux/candela) would mean re-deriving the sky's already hand-tuned absolute scale to match. Anchoring to the sky instead costs nothing and still gets correct falloff. See [Light units](#light-units). |
| Exposure            | **One scalar**, promoted from the sky's existing `HDR_SCALE`       | A single knob rather than an aperture/shutter/ISO triple. Nothing to tune that isn't already tuned.                                                                                                                           |
| Ambient             | **Sky-captured IBL**, no flat constant                             | The atmosphere model is already physically based — capturing it is far cheaper than authoring ambient, and it tracks weather automatically.                                                                                   |
| IBL capture         | **Amortised** — a face or mip per frame, plus on sun/weather delta | The sky changes slowly. A full cubemap re-prefilter every frame would be pure waste.                                                                                                                                          |
| Specular IBL        | **Prefiltered roughness mip chain + split-sum BRDF LUT**           | The standard approach; reuses the existing `mipmap-generator.wgsl` machinery as a starting point.                                                                                                                             |
| Diffuse IBL         | **Irradiance cubemap** (small, e.g. 16²)                           | Simpler to reason about than SH and trivially cheap at that resolution.                                                                                                                                                       |
| Terrain integration | **Swap the shader include**                                        | `terrain.wgsl` already composes shading via `#include`; PBR slots into the same seam.                                                                                                                                         |
| Per-frame compute   | **None added**                                                     | Consistent with Foxfire. IBL prefilter is amortised, not per-frame.                                                                                                                                                           |

---

## Architecture sketch

```
                     ┌─ baseColor (sRGB) ─┐
glTF / materials.json ├─ metallicRough ────┤
                     ├─ normal ───────────┼─▶ StandardPass ──┐
                     ├─ occlusion ────────┤                  │
                     └─ emissive (sRGB) ──┘                  │
                                                             ▼
lights (physical units) ──▶ Lighting storage buffer ──▶  pbr.frag.wgsl  ──▶ HDR scene
                                                        (GGX + Smith         (rgba16float)
shadow atlas ──▶ PCF ──────────────────────────────▶     + Fresnel)              │
                                                             ▲                   │
SkyRenderer ──▶ cube capture ──▶ irradiance cube ────────────┤                   │
                     │           (diffuse IBL)                │                   │
                     └────────▶ prefiltered spec mips ───────┘                   │
                                 + BRDF LUT                                      │
                                                                                 ▼
sky / clouds / fog / god rays (HDR, already) ──────────▶ composite ──▶ ACES ──▶ swapchain
                                                          (blend only,   (single
                                                           no tonemap)    whole-frame)
```

The change in shape: today the ACES box sits _inside_ the sky composite and only the sky's own
contribution passes through it. Lichen moves it to the end, after everything has been blended in
HDR, so terrain and objects go through the same curve as the sky.

---

## Phases & issues

This section is the **running order** for the milestone. Phases run in sequence; within a phase,
anything without a listed dependency can be picked up in parallel. Phase 1 is the unblocker —
nothing after it is meaningful until light values above 1.0 survive to the end of the frame.

The tables below are the authoritative running order — the
[milestone board](https://github.com/MKHenson/rewild/milestone/5) itself is unordered, though each
issue names its own prerequisites.

### Phase 1 — HDR scene pass & unified tonemapping

| #                                                     | Issue                                                                                                                                                       | Depends on |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| [#188](https://github.com/MKHenson/rewild/issues/188) | Render the scene pass to `rgba16float` instead of `presentationFormat`                                                                                      | —          |
| [#189](https://github.com/MKHenson/rewild/issues/189) | Move ACES tonemapping to a single whole-frame step; the sky composite blends in HDR and stops tonemapping its own contribution, keeping the existing dither | #188       |
| [#190](https://github.com/MKHenson/rewild/issues/190) | Declare texture colour spaces correctly — `rgba8unorm-srgb` for albedo/emissive, linear for normal/roughness/metallic/AO, mips in linear space              | —          |

### Phase 2 — Light units & exposure

| #                                                     | Issue                                                                                                | Depends on |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------- |
| [#191](https://github.com/MKHenson/rewild/issues/191) | Inverse-square falloff with a smooth range window, replacing the linear `1 - dist/range` ramp        | #188       |
| [#192](https://github.com/MKHenson/rewild/issues/192) | Promote the sky's `HDR_SCALE` to a camera exposure property, applied at the tonemap step             | #189       |
| [#193](https://github.com/MKHenson/rewild/issues/193) | Convert existing lights using the reference-distance formula; relabel the editor's intensity control | #191       |

### Phase 3 — Standard material

| #                                                     | Issue                                                                                                                                                                                        | Depends on |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| [#194](https://github.com/MKHenson/rewild/issues/194) | `StandardPass` + `pbr.frag.wgsl` — GGX/Smith/Schlick through the existing `shader-lib` include pattern                                                                                       | #189       |
| [#195](https://github.com/MKHenson/rewild/issues/195) | Full metallic-roughness texture set, including ORM channel packing                                                                                                                           | #194, #190 |
| [#196](https://github.com/MKHenson/rewild/issues/196) | glTF material semantics — `alphaMode` OPAQUE/MASK/BLEND, `alphaCutoff`, `doubleSided`, `emissiveStrength`, vertex colours. _MASK + double-sided is what foliage cutouts need in Understory._ | #194       |
| [#197](https://github.com/MKHenson/rewild/issues/197) | `materials.json` schema + `MaterialManager` support for `type: 'standard'`                                                                                                                   | #194       |
| [#198](https://github.com/MKHenson/rewild/issues/198) | Instanced variant (`StandardInstancedPass`), so Understory's scatter has a target                                                                                                            | #197       |

### Phase 4 — Sky-driven IBL

| #                                                     | Issue                                                                              | Depends on |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- |
| [#199](https://github.com/MKHenson/rewild/issues/199) | Render the atmosphere to a cubemap from `SkyRenderer`, with amortised face updates | #188       |
| [#200](https://github.com/MKHenson/rewild/issues/200) | Prefilter it — irradiance cube, roughness-mipped specular cube, BRDF LUT           | #199       |
| [#201](https://github.com/MKHenson/rewild/issues/201) | Wire IBL into `pbr.frag.wgsl` and delete the flat `ambientColor` term              | #200, #194 |

### Phase 5 — Adoption, tooling & parity

| #                                                     | Issue                                                                                                                                | Depends on       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| [#202](https://github.com/MKHenson/rewild/issues/202) | Terrain adopts the PBR include; per-material `specular`/`shininess` re-tuned to roughness (see [Migration & risk](#migration--risk)) | #201             |
| [#203](https://github.com/MKHenson/rewild/issues/203) | PBR reference harness — metallic × roughness sphere grid, reference model, and the material/IBL debug views                          | #194             |
| [#204](https://github.com/MKHenson/rewild/issues/204) | Editor material inspector for metallic/roughness/emissive                                                                            | #197, #103, #104 |

**Worth pulling forward:** [#203](https://github.com/MKHenson/rewild/issues/203) is listed in Phase 5
but is most valuable the moment [#194](https://github.com/MKHenson/rewild/issues/194) lands — the
sphere grid is what turns "does this look right?" into a measurement, and both the terrain re-tune
(#202) and the colour-space work (#190) are much easier to verify against it.

---

## Light units

PBR needs light values that mean something, but there are two ways to get there and only one of
them is cheap here.

**Full photometric units** — sun in lux, lamps in candela, camera exposure derived from aperture,
shutter and ISO — is the textbook answer. It is the wrong answer for Rewild, because the
atmosphere model **already defines an absolute radiance scale**, and that scale has been tuned by
hand against ACES and `HDR_SCALE` until the sky looked right. Adopting photometric units means
re-deriving all of that to land on the same picture. That is a large amount of tuning to arrive
back where we started.

So instead: **the sky defines the unit system, and everything else is expressed relative to it.**

- **The sun doesn't change.** Its radiance keeps coming from the atmosphere model exactly as it
  does today.
- **Point and spot lights** switch to inverse-square with a smooth window that takes intensity to
  zero at `range` — physically correct near-field falloff, and the hard cutoff Foxfire's culling
  budget relies on is preserved.
- **Exposure is one scalar**, which is the sky's existing `HDR_SCALE` promoted to a camera property
  and moved to the tonemap step. No new tuning surface.

The practical payoff is the migration. Because the sun is untouched and the reference brightness is
unchanged, converting an existing light is mechanical: solve for the intensity that preserves its
current apparent brightness at a reference distance (its mid-range), and levels come out looking
close to how they went in. Compare that to a photometric switch, which would require relighting
every level by hand.

The tradeoff accepted: intensities aren't portable to or from real-world reference values. For an
engine whose dominant light is a sky it already owns, that's worth very little.

---

## Scope boundary with Understory

The line is drawn at **who creates the material**:

- **Lichen** owns the material _model_ — the BRDF, the texture semantics, the `standard` type in
  `materials.json`, and proving it renders correctly. Test assets are a handful of meshes exported
  from Blender, loaded through the existing single-primitive stub in `core/GltfLoader.ts`.
- **Understory** owns the _importer_ — walking the glTF node hierarchy, handling multi-primitive
  meshes and tangents, and auto-creating `standard` materials from glTF material definitions.

This keeps two moving variables apart. When a model looks wrong in Understory, the material model
will already have been validated against the reference harness.

---

## Performance notes (web budget)

- **PBR fragment cost over Phong is small** — GGX plus Smith plus Fresnel is a modest ALU
  increase, and it is dwarfed by what terrain already spends on parallax occlusion mapping and
  splat blending.
- **The real cost is bandwidth.** An `rgba16float` scene colour attachment doubles write bandwidth
  on the main pass. Worth noting that the entire sky pipeline already pays exactly this cost, so
  the budget is a known quantity rather than a guess.
- **IBL is amortised, not per-frame** — a face or mip per frame plus an event-driven refresh on
  sun/weather change. The sky changes over seconds, not frames.
- **No new per-frame compute passes**, consistent with Foxfire's decision to avoid them.
- **Shadow cost is unchanged** — Lichen does not touch the shadow atlas or cascade setup.

---

## Migration & risk

This milestone changes how **everything already in the engine** looks. That is the point, but it
needs to be planned for rather than discovered.

| Risk                                            | Impact                                                                                                                                                                   | Mitigation                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Moving tonemapping out of the sky composite** | Highest-risk single edit in the milestone. `skyComposite.wgsl` interleaves fog, god rays, cloud occlusion, lightning flash and dither, with several hand-tuned branches. | Do it first, in isolation, with before/after captures at several times of day and weather states. Nothing else lands until it is stable.                                                |
| **The sRGB fix changes every existing texture** | Correctly-decoded albedo will read darker and more saturated. Terrain material colours are currently tuned _against_ the wrong decode.                                   | Expect a terrain re-tune as part of Phase 5, not a bug. Budget for it.                                                                                                                  |
| **New light falloff changes existing levels**   | Inverse-square is not a rescale of `1 - d/range` — near-field gets brighter, far-field dimmer.                                                                           | Mechanical conversion preserving apparent brightness at each light's mid-range. Because units stay sky-anchored the sun is untouched, so this is a per-light fix rather than a relight. |
| **Terrain specular/shininess → roughness**      | Per-material values in `TerrainMaterials.ts` are hand-tuned Phong exponents. There is no mechanical conversion that preserves appearance.                                | Treat as a deliberate re-tune with the reference harness available for calibration.                                                                                                     |
| **Judging correctness by eye**                  | Easy to "fix" a BRDF bug by compensating elsewhere, then have it resurface in Understory under different lighting.                                                       | Land the reference harness early — the metallic × roughness grid makes energy-conservation and Fresnel errors obvious rather than arguable.                                             |

---

## Debugger / console functions

Following the existing conventions in `src/core/debug/`:

| Function                                                                                         | What it does                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `setExposure(ev100)`                                                                             | Override camera exposure to check that HDR values survive the pipeline.                                                              |
| `showPbrReferenceGrid()` / `hidePbrReferenceGrid()`                                              | Spawn the metallic × roughness sphere grid in front of the camera.                                                                   |
| `setMaterialChannel('basecolor' \| 'metallic' \| 'roughness' \| 'normal' \| 'ao' \| 'emissive')` | Visualise one PBR channel across the whole scene — the fastest way to spot a mis-declared colour space or a wrong normal convention. |
| `showIblCubes()`                                                                                 | Display the captured, irradiance and prefiltered-specular cubemaps on screen.                                                        |
| `setIblEnabled(bool)`                                                                            | Toggle IBL to separate direct-lighting bugs from ambient ones.                                                                       |

---

## Related docs

- [Lighting (Foxfire)](./foxfire-lighting.md) — the light types, storage buffer and shadow atlas
  this milestone shades with.
- [Terrain (Strata)](./strata.md) — the material library and biome layer rules that adopt PBR in
  Phase 5.
- [Sky Rendering](../sky-rendering.md) — the HDR pipeline Lichen extends, and the atmosphere the
  IBL is captured from.
- [Weather System](../weather.md) — why sky-captured IBL is worth the trouble: ambient follows the
  weather with no extra authoring.
- [Renderer](../renderer.md) — pass structure and the WGSL `#include` mechanism.
