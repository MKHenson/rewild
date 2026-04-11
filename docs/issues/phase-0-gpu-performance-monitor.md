# Phase 0: GPU Performance Monitor

## Summary

Create a GPU timestamp query profiling system for the sky renderer. This establishes a performance baseline before any rendering changes and provides ongoing metrics to validate that each subsequent phase meets the 120 FPS target.

## Motivation

The sky rendering pipeline has multiple passes (clouds, atmosphere, bloom, TAA, final composite) and no way to measure per-pass GPU time. We need hard numbers before and after each optimization phase.

## Tasks

### 0.1: Create `PerformanceMonitor` utility

- [ ] Create new file: `packages/rewild-renderer/lib/utils/PerformanceMonitor.ts`
- [ ] Implement GPU timestamp queries using `GPUQuerySet` (type `'timestamp'`)
- [ ] Support named query regions: `beginQuery(encoder, label)` / `endQuery(encoder, label)`
- [ ] Resolve timestamps to milliseconds via `resolveQuerySet()` + `GPUBuffer` readback
- [ ] Provide `async getResults(): Promise<Map<string, number>>` returning per-label ms values
- [ ] Handle devices that don't support `'timestamp-query'` feature gracefully (no-op fallback)
- [ ] Add a `enabled: boolean` toggle so it can be turned off in production

### 0.2: Integrate into `SkyRenderer`

- [ ] Import and instantiate `PerformanceMonitor` in `SkyRenderer` constructor
- [ ] Wrap each pass in the `render()` method ([SkyRenderer.ts#L206-L230](../packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts#L206-L230)) with query regions:
  - `sky-clouds` — `cloudsPass.render()`
  - `sky-atmosphere` — `atmospherePass.render()`
  - `sky-bloom` — `bloomPass.render()`
  - `sky-taa` — `taaPass.render()`
  - `sky-final` — `finalPass.render()`
  - `sky-total` — entire `render()` method
- [ ] Log results once per second (or on demand) to console in a table format

### 0.3: Document baseline measurements

- [ ] Run at 1920×1080 on test hardware and record ms per pass
- [ ] Add baseline numbers as a comment in `SkyRenderer.ts` or in `atmospheric-rendering.md`

## Acceptance Criteria

- [ ] `PerformanceMonitor` class compiles and works with WebGPU timestamp queries
- [ ] Falls back gracefully when `timestamp-query` is not available
- [ ] Per-pass GPU timings logged to console
- [ ] No performance impact when `enabled = false`
- [ ] Baseline numbers documented

## Files

| Action | Path                                                        |
| ------ | ----------------------------------------------------------- |
| Create | `packages/rewild-renderer/lib/utils/PerformanceMonitor.ts`  |
| Modify | `packages/rewild-renderer/lib/renderers/sky/SkyRenderer.ts` |

## Labels

`enhancement`, `renderer`, `sky`, `tooling`
