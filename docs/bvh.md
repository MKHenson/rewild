# BVH System — Usage Guide

The Rewild renderer includes a Bounding Volume Hierarchy (BVH) system for accelerated raycasting and frustum culling. This guide covers how to use the APIs. For implementation details, read the source files directly in `lib/acceleration/`.

## How It Works Automatically

For most use cases, **you don't need to do anything**. The Renderer handles BVH automatically:

1. When `geometry.build()` is called, geometries with ≥ 1,000 triangles get a BVH built automatically.
2. Large geometries (≥ 10,000 triangles) are built asynchronously in a Web Worker to avoid frame drops.
3. `Mesh.raycast()` uses the BVH when available, falls back to brute-force otherwise.
4. While an async BVH is building, `BVH.isReady` is `false` and raycasting gracefully falls back to brute-force.
5. When geometry vertices change and `geometry.bvhNeedsUpdate = true`, the Renderer automatically refits the BVH each frame.

## Configuration

All BVH behaviour is controlled through `renderer.bvhConfig`, initialised from `DEFAULT_BVH_CONFIG`:

```typescript
// Adjust thresholds
renderer.bvhConfig.autoComputeThreshold = 500; // Lower: more geometries get BVH (default: 1000)
renderer.bvhConfig.asyncBuildThreshold = 5000; // Lower: more geometries use worker (default: 10000)

// Change strategy
renderer.bvhConfig.geometryBVHStrategy = 'center'; // Faster builds, less optimal tree (default: 'sah')

// Disable features
renderer.bvhConfig.autoComputeGeometryBVH = false; // No auto-BVH on geometry.build()
renderer.bvhConfig.autoRefitGeometryBVH = false; // No auto-refit in render loop
renderer.bvhConfig.enableSceneBVH = false; // No scene-level BVH
```

Full `BVHConfig` interface (in `lib/acceleration/BVHConfig.ts`):

| Property                      | Default | Purpose                                                |
| ----------------------------- | ------- | ------------------------------------------------------ |
| `autoComputeGeometryBVH`      | `true`  | Auto-build BVH when `geometry.build()` is called       |
| `autoComputeThreshold`        | `1000`  | Min triangle count to trigger auto-build               |
| `geometryBVHStrategy`         | `'sah'` | Build strategy: `'sah'` (optimal) or `'center'` (fast) |
| `geometryBVHMaxDepth`         | `32`    | Max tree depth                                         |
| `geometryBVHMaxLeafTriangles` | `8`     | Max triangles per leaf node                            |
| `asyncBuildThreshold`         | `10000` | Min triangle count to build in Web Worker              |
| `enableSceneBVH`              | `true`  | Create a SceneBVH on the Renderer                      |
| `sceneBVHAutoUpdate`          | `true`  | Auto-call `sceneBVH.update()` each frame               |
| `sceneBVHUpdateThreshold`     | `0.1`   | Fraction of moved objects that triggers full rebuild   |
| `autoRefitGeometryBVH`        | `true`  | Auto-refit dirty geometry BVHs in render loop          |

## Manual Geometry BVH

When auto-compute is disabled or you need explicit control:

```typescript
// Synchronous build (blocks main thread)
geometry.computeBVH();
geometry.computeBVH({ strategy: 'center', maxLeafTriangles: 4 });

// Async build via Web Worker (non-blocking)
await geometry.computeBVHAsync(renderer.bvhWorkerManager!);

// Remove BVH
geometry.disposeBVH();
```

`computeBVH()` and `computeBVHAsync()` are on `Geometry`, not `Mesh`. Multiple meshes sharing the same geometry share its BVH.

## Dynamic Geometry (Refit)

When vertices change at runtime (morph targets, procedural animation, terrain):

```typescript
// Modify vertices
geometry.vertices[index] = newValue;

// Option A: Automatic (default) — just flag it
geometry.bvhNeedsUpdate = true;
// Renderer calls geometry.bvh.refit() automatically before culling

// Option B: Manual — when autoRefitGeometryBVH is false
geometry.bvh?.refit();
geometry.bvhNeedsUpdate = false;
```

Refit updates bounding boxes bottom-up without restructuring the tree. Much faster than a full rebuild.

## Scene-Level BVH

`SceneBVH` accelerates frustum culling and whole-scene raycasting. It is a **separate structure** from the scene graph — the `scene: Transform` hierarchy is unchanged.

### Automatic Rebuild on Scene Changes

SceneBVH **automatically detects** when children are added or removed. `Transform.addChild()` and `removeChild()` increment a `structureVersion` counter that bubbles up to the scene root. On each `update()` call, SceneBVH compares the root's version and rebuilds if it changed.

With `sceneBVHAutoUpdate` enabled (default), the Renderer calls `sceneBVH.update()` each frame — so you typically don't need to do anything after adding/removing objects.

### Manual Control (Optional)

For explicit control or performance-sensitive cases:

```typescript
// Force immediate rebuild (e.g. after loading a full scene)
renderer.sceneBVH.rebuild();

// Mark dirty without waiting for version check
renderer.sceneBVH.markDirty();

// Track a moved object for refit optimisation
renderer.sceneBVH.markObjectMoved(transform);
// update() will refit (few moves) or rebuild (many moves) based on updateThreshold
```

### Spatial Queries

```typescript
// Frustum culling
const visible = renderer.sceneBVH.frustumCull(camera.frustum);

// Scene raycasting (uses per-geometry BVH internally)
const hits = renderer.sceneBVH.raycast(raycaster);

// Or via Raycaster
const hits = raycaster.intersectBVHScene(renderer.sceneBVH);

// Box query — find all objects overlapping a region
const nearby = renderer.sceneBVH.queryBox(searchBox);

// Radius query — find all objects within distance of a point
const inRange = renderer.sceneBVH.queryRadius(point, radius);
```

### Best Practices

- **Batch loading**: After loading a full scene, call `rebuild()` to build immediately rather than waiting for the next frame's `update()`.
- **Moved objects**: Call `markObjectMoved(transform)` for efficient refit instead of full rebuild.

## Async Worker Architecture

Large geometry BVH builds run in a Web Worker to avoid frame drops:

```
Main thread                           Worker thread
───────────                           ─────────────
geometry.computeBVHAsync()
  → BVHWorkerManager.buildAsync()
    → postMessage (transfer)  ───────→  BVHBuilder.build()
                                        serializeBVH()
    ← postMessage (transfer)  ←───────  Float32Array + Uint32Array
  ← deserializeBVH()
  ← BVH.isReady = true
```

The worker is a separate esbuild entry point (`bvhWorker.js`) that shares source classes with the main bundle. BVH trees are serialised as flat typed arrays for efficient `postMessage` transfer.

The `BVHWorkerManager` is created automatically by the Renderer when `asyncBuildThreshold > 0`. Access it via `renderer.bvhWorkerManager`. It is disposed in `renderer.dispose()`.

## File Structure

```
packages/rewild-renderer/lib/
├── acceleration/
│   ├── BVH.ts                  # Per-geometry BVH (sync/async build, raycast, refit)
│   ├── BVHBuilder.ts           # Tree construction (SAH + center split strategies)
│   ├── BVHConfig.ts            # BVHConfig interface + DEFAULT_BVH_CONFIG
│   ├── BVHNode.ts              # Node class, BVHOptions interface
│   ├── BVHSerializer.ts        # Serialize/deserialize for worker transfer
│   ├── BVHUtils.ts             # countNodes(), countLeaves(), getMaxDepth()
│   ├── BVHWorkerManager.ts     # Worker lifecycle + request routing
│   ├── SceneBVH.ts             # Scene-level BVH (frustumCull, raycast, queryBox, queryRadius)
│   ├── SceneBVHNode.ts         # Scene BVH node (holds Transform[])
│   ├── index.ts                # Re-exports all types
│   └── worker/
│       └── BVHWorker.ts        # Web Worker entry point (separate esbuild bundle)
├── core/
│   ├── Mesh.ts                 # Uses geometry.bvh in raycast when available
│   └── Raycaster.ts            # intersectBVHScene() method
├── geometry/
│   └── Geometry.ts             # computeBVH(), computeBVHAsync(), auto-compute in build()
└── Renderer.ts                 # bvhConfig, bvhWorkerManager, auto-refit loop
```
