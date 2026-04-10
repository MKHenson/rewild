# BVH Integration Plan for Rewild Renderer

## Executive Summary

This plan outlines the integration of Bounding Volume Hierarchies (BVH) into the Rewild game engine renderer for improved raycasting performance and frustum culling. The implementation will support both per-mesh and scene-level BVH structures, inspired by the three-mesh-bvh architecture but adapted for WebGPU and the engine's existing structure.

## Current Architecture Analysis

### Existing Components

- **Mesh** (`lib/core/Mesh.ts`): Contains basic raycasting with bounding sphere/box early-out, then brute-force triangle iteration
- **Geometry** (`lib/geometry/Geometry.ts`): Has `boundingSphere` and `boundingBox` computed on demand
- **Raycaster** (`lib/core/Raycaster.ts`): Ray intersection system with scene graph traversal
- **Transform** (`lib/core/Transform.ts`): Scene graph node system
- **RenderList** (`lib/core/RenderList.ts`): Organizes objects for rendering (currently no spatial culling)

### Current Limitations

1. **Per-mesh raycasting**: O(n) triangle iteration after bounding volume test (Mesh.ts:195-220)
2. **No scene-level acceleration**: Objects are traversed linearly (Raycaster.ts:140-156)
3. **Limited culling**: Frustum culling exists in materials but no broad-phase acceleration
4. **No spatial queries**: No efficient nearest-neighbor or radius queries

## Proposed Architecture

### Phase 1: Core BVH Foundation

#### 1.1 Create BVH Data Structures (`lib/acceleration/BVHNode.ts`)

```typescript
// Core BVH node structure
export class BVHNode {
  boundingBox: Box3;
  leftChild: BVHNode | null;
  rightChild: BVHNode | null;

  // Leaf node data
  isLeaf: boolean;
  triangleOffset: number; // Start index in triangle array
  triangleCount: number; // Number of triangles in this leaf
}

export interface BVHOptions {
  strategy: 'sah' | 'center' | 'average';
  maxDepth: number;
  maxLeafTriangles: number;
  enableRefit: boolean;
}
```

#### 1.2 Create BVH Builder (`lib/acceleration/BVHBuilder.ts`)

Implement two build strategies:

- **SAH (Surface Area Heuristic)**: For static geometry, better query performance
- **Center/Average Split**: For dynamic geometry, faster builds

Key methods:

- `buildBVH(geometry: Geometry, options: BVHOptions): BVHNode`
- `buildSAH()`: Optimal splitting using surface area heuristic
- `buildCenter()`: Fast mid-point splitting
- `refitBVH(node: BVHNode)`: Update bounds after vertex modifications

#### 1.3 BVH Acceleration Structure (`lib/acceleration/BVH.ts`)

**Important**: `BVH` is an acceleration structure that lives inside `Geometry`, not a replacement for `Mesh`. Users always use the `Mesh` class - the BVH is an internal optimization.

```typescript
/**
 * BVH acceleration structure for geometry raycasting and queries.
 * This lives as an optional property on Geometry: geometry.bvh
 * Multiple Mesh instances can share the same Geometry (and its BVH).
 */
export class BVH {
  root: BVHNode;
  geometry: Geometry;
  options: BVHOptions;
  isReady: boolean = false; // True when async build completes

  constructor(geometry: Geometry, options?: Partial<BVHOptions>);

  // Core queries
  raycast(ray: Ray, material: IMaterialPass): Intersection | null;
  raycastFirst(ray: Ray): Intersection | null;

  // Advanced queries
  closestPointToPoint(point: Vector3): Vector3;
  distanceToPoint(point: Vector3): number;

  // Dynamic mesh support
  refit(): void; // Update BVH after vertex modifications
  rebuild(): void; // Full reconstruction
}
```

**Usage Example:**

```typescript
// Create geometry and mesh as usual
const geometry = new SphereGeometry(10, 64, 64);
const mesh = new Mesh(geometry, material); // Always use Mesh

// Optionally enable BVH acceleration on the geometry
geometry.computeBVH({ strategy: 'sah' });

// Raycasting automatically uses BVH if available
raycaster.intersectObject(mesh); // Fast! Uses geometry.bvh internally
```

### Phase 2: Per-Geometry BVH Integration

**Key Concept**: The BVH lives on `Geometry`, not `Mesh`. This is because:

- Multiple `Mesh` instances can share the same `Geometry`
- The BVH is built from geometry data (vertices, indices)
- Users always use `Mesh` - the BVH is transparent

#### 2.1 Extend Geometry Class

Add to `lib/geometry/Geometry.ts`:

```typescript
export class Geometry {
  // ... existing properties

  // New BVH properties (optional - only created if computeBVH() is called)
  bvh: BVH | null = null;
  bvhNeedsUpdate: boolean = false;

  // New methods
  computeBVH(options?: Partial<BVHOptions>): void {
    // Creates and stores BVH acceleration structure
    this.bvh = new BVH(this, options);
    this.bvhNeedsUpdate = false;
  }

  disposeBVH(): void {
    this.bvh = null;
  }

  // Note: Users continue using Mesh as normal
  // The BVH is an internal optimization that Mesh.raycast() will check for
}
```

#### 2.2 Update Mesh Raycasting

Modify `lib/core/Mesh.ts:88-132` (the `raycast` method):

```typescript
raycast(raycaster: IRaycaster, intersects: Intersection[]) {
  // ... existing bounding sphere/box tests ...

  // Use BVH if available
  if (this.geometry.bvh) {
    const intersection = this.geometry.bvh.raycast(
      rayLocalSpace,
      this.material
    );
    if (intersection) {
      // Transform to world space
      intersection.point.applyMatrix4(this.transform.matrixWorld);
      intersection.object = this.transform;
      intersects.push(intersection);
    }
  } else {
    // Fall back to existing brute-force method
    this._computeIntersections(raycaster, intersects, _ray);
  }
}
```

**Performance Impact**: Expected 10-100x speedup for raycasting on complex meshes (>10k triangles)

### Phase 3: Scene-Level BVH

#### 3.1 Create Scene BVH (`lib/acceleration/SceneBVH.ts`)

**Important**: `SceneBVH` is a separate acceleration structure built FROM the scene graph, not a replacement for it. The existing `scene: Transform` hierarchy remains unchanged.

**Design:**

- Scene graph (`Transform` tree): Handles hierarchy, parent-child, transforms
- Scene BVH: Accelerates spatial queries (culling, raycasting)
- BVH holds references to Transform nodes, rebuilt/refitted when objects move
- **Manual control**: Developer explicitly calls `markDirty()` or `rebuild()` after scene changes

```typescript
export class SceneBVH {
  private root: SceneBVHNode;
  private sceneRoot: Transform; // Reference to scene graph root
  private objects: Transform[]; // Flat list of objects in BVH

  // Change tracking (manual control)
  private isDirty: boolean = false;
  private movedObjects: Set<Transform> = new Set();
  private updateThreshold: number = 0.1; // Rebuild if >10% objects changed

  constructor(sceneRoot: Transform) {
    this.sceneRoot = sceneRoot;
    this.build();
  }

  /**
   * Mark the BVH as needing a rebuild.
   * Call this after adding/removing objects from the scene.
   * Rebuild will happen on next update() call.
   */
  markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Force immediate rebuild of the entire BVH from the scene graph.
   * Use this after batch operations (loading scenes, adding many objects).
   */
  rebuild(): void {
    this.build();
    this.isDirty = false;
  }

  /**
   * Mark an object as moved (for refit optimization).
   * Called automatically by Renderer when transforms change.
   */
  markObjectMoved(transform: Transform): void {
    this.movedObjects.add(transform);
  }

  /**
   * Update BVH based on dirty flag and moved objects.
   * Call this in render loop or manually after changes.
   */
  update(): void {
    if (this.isDirty) {
      // Structure changed (add/remove) - full rebuild
      this.build();
      this.isDirty = false;
      return;
    }

    const movedCount = this.movedObjects.size;
    const totalCount = this.objects.length;

    if (movedCount / totalCount > this.updateThreshold) {
      // Too many objects moved - rebuild is faster
      this.build();
    } else if (movedCount > 0) {
      // Few objects moved - refit existing structure
      this.refit();
      this.movedObjects.clear();
    }
  }

  private build(): void {
    this.objects = [];
    this.collectObjects(this.sceneRoot);
    this.root = this.buildNode(this.objects);
    this.movedObjects.clear();
  }

  private refit(): void {
    // Update bounding boxes up the tree for moved objects
    // Much faster than rebuild
  }

  // Queries
  raycast(ray: Ray, recursive: boolean): Intersection[];
  frustumCull(frustum: Frustum): Transform[];

  // Spatial queries
  queryRadius(point: Vector3, radius: number): Transform[];
  queryBox(box: Box3): Transform[];

  dispose(): void {
    // Cleanup if needed
  }
}
```

#### 3.2 Scene BVH Node Structure

For scene-level BVH, nodes store references to Transform objects rather than triangles:

```typescript
export class SceneBVHNode extends BVHNode {
  // Override for object-level nodes
  objects: Transform[]; // For leaf nodes
}
```

#### 3.2.1 Manual BVH Updates - Usage Examples

**Philosophy**: Developer explicitly controls when BVH rebuilds happen. This provides better performance and predictability than automatic event listening.

**Example 1 - Forest System:**

```typescript
// Setup forest root
const forestRoot = new Transform();
renderer.scene.addChild(forestRoot);

// Add many trees efficiently (no BVH overhead during loading)
for (let i = 0; i < 1000; i++) {
  const tree = new Mesh(treeGeometry, treeMaterial);
  forestRoot.addChild(tree.transform);
}

// NOW rebuild BVH once for all 1000 trees
renderer.sceneBVH.rebuild();
```

**Example 2 - Terrain System (already works!):**

```typescript
// TerrainRenderer adds/removes chunks dynamically
terrainRenderer.update(renderer, camera); // Adds/removes chunks internally

// Option A: Auto-rebuild in render loop
if (renderer.sceneBVHAutoUpdate) {
  renderer.sceneBVH.update(); // Only rebuilds if isDirty
}

// Option B: Manual rebuild after terrain updates
terrainRenderer.update(renderer, camera);
if (terrainRenderer.chunksChanged) {
  renderer.sceneBVH.rebuild();
}
```

**Example 3 - Batch Operations:**

```typescript
// Spawn multiple objects
for (const spawnPoint of spawnPoints) {
  const enemy = createEnemy();
  scene.addChild(enemy.transform);
}

// Mark BVH dirty (doesn't rebuild yet)
renderer.sceneBVH.markDirty();

// Later in render loop, rebuild happens once
renderer.sceneBVH.update(); // Checks isDirty, rebuilds if needed
```

**Example 4 - One-time Scene Setup:**

```typescript
// Load entire scene at once
await loadGLTF('scene.gltf', renderer.scene);

// Build BVH once after everything loaded
renderer.sceneBVH.rebuild();
```

**Benefits of manual control:**

- ✅ No event listener overhead (performance & memory)
- ✅ Batch operations (add 1000 trees, rebuild once)
- ✅ Explicit control (developer decides when)
- ✅ Simpler code (no complex listener management)
- ✅ More predictable (no surprise rebuilds)

#### 3.3 Integrate with Renderer

Modify `lib/Renderer.ts`:

```typescript
export class Renderer {
  // ... existing properties

  // Scene graph remains unchanged!
  scene: Transform; // Root of scene hierarchy

  // New: Optional scene-level BVH for acceleration
  sceneBVH: SceneBVH | null = null;
  sceneBVHAutoUpdate: boolean = false; // Set to true for automatic updates

  init() {
    // Scene graph setup (unchanged)
    this.scene = new Transform();
    this.scene.matrixAutoUpdate = false;

    // Optionally create scene BVH
    if (config.enableSceneBVH) {
      this.sceneBVH = new SceneBVH(this.scene);
    }
  }

  // In render loop (around line ~200-250)
  render() {
    // Update scene graph transforms (unchanged)
    this.scene.updateMatrixWorld();

    // Mark moved objects for BVH refit (automatic)
    if (this.sceneBVH) {
      this.scene.traverse((node) => {
        if (node.matrixWorldNeedsUpdate) {
          this.sceneBVH.markObjectMoved(node);
        }
      });
    }

    // Optional: Auto-update BVH if enabled
    if (this.sceneBVHAutoUpdate && this.sceneBVH) {
      this.sceneBVH.update(); // Only rebuilds if isDirty or many objects moved
    }

    // Use BVH for frustum culling
    let visibleObjects: Transform[];
    if (this.sceneBVH) {
      visibleObjects = this.sceneBVH.frustumCull(this.perspectiveCam.frustum);
    } else {
      // Existing traversal logic as fallback
      visibleObjects = this.traverseSceneGraph(this.scene);
    }

    // Build render list from visible objects
    this.buildRenderList(visibleObjects);
  }

  dispose() {
    // ... existing cleanup
    this.sceneBVH?.dispose();
  }
}
```

**Key points:**

- `scene: Transform` stays as the source of truth for scene hierarchy
- `sceneBVH` is built from and references the scene graph
- Both structures coexist - scene graph for hierarchy, BVH for speed
- **Manual control**: Developer calls `sceneBVH.markDirty()` or `rebuild()` after add/remove
- **Automatic refit**: Renderer automatically marks moved objects for refit optimization
- **Optional auto-update**: Set `sceneBVHAutoUpdate = true` for automatic updates in render loop

#### 3.4 Update Raycaster

Modify `lib/core/Raycaster.ts` - **Add new method instead of modifying existing**:

```typescript
export class Raycaster implements IRaycaster {
  // ... existing properties

  // Existing method - unchanged, raycasts against object/subtree
  intersectObject(
    object: Transform,
    recursive: boolean = false,
    intersects: Intersection[] = []
  ): Intersection[] {
    intersectObject(object, this, intersects, recursive);
    intersects.sort(ascSort);
    return intersects;
  }

  // NEW: Raycast entire scene using BVH acceleration
  intersectBVHScene(
    sceneBVH: SceneBVH,
    intersects: Intersection[] = []
  ): Intersection[] {
    sceneBVH.raycast(this.ray, true, intersects);
  }

  intersectObjects(
    objects: Transform[],
    recursive: boolean = false,
    intersects: Intersection[] = []
  ): Intersection[] {
    for (let i = 0, l = objects.length; i < l; i++) {
      intersectObject(objects[i], this, intersects, recursive);
    }
    intersects.sort(ascSort);
    return intersects;
  }
}
```

**Usage:**

```typescript
// Raycast against specific object/subtree (existing behavior)
const intersects = raycaster.intersectObject(mesh.transform, true);

// NEW: Raycast against entire scene (uses BVH if available)
const sceneIntersects = raycaster.intersectScene(renderer.sceneBVH);
```

**Benefits:**

- Explicit and clear intent
- No magic checks for `object === renderer.scene`
- Optimized for each use case
- Backward compatible - existing code unchanged

### Phase 4: Configuration & Control ✅ COMPLETE

#### 4.1 Global Configuration (`lib/acceleration/BVHConfig.ts`)

A single `BVHConfig` interface controls all BVH behaviour. The Renderer holds
a `bvhConfig` property initialised from `DEFAULT_BVH_CONFIG`.

```typescript
export interface BVHConfig {
  // ── Per-geometry BVH ──
  autoComputeGeometryBVH: boolean; // Auto-build BVH on geometry.build()
  autoComputeThreshold: i32; // Triangle count threshold (default: 1000)
  geometryBVHStrategy: BVHStrategy; // 'sah' | 'center' (default: 'sah')
  geometryBVHMaxDepth: i32; // Default: 32
  geometryBVHMaxLeafTriangles: i32; // Default: 8

  // ── Async (worker) builds ──
  asyncBuildThreshold: i32; // Triangles before using worker (default: 10000)

  // ── Scene BVH ──
  enableSceneBVH: boolean; // Create SceneBVH on Renderer (default: true)
  sceneBVHAutoUpdate: boolean; // Auto-call sceneBVH.update() each frame
  sceneBVHUpdateThreshold: f32; // Moved-object fraction triggering rebuild (0.1)

  // ── Dynamic refit ──
  autoRefitGeometryBVH: boolean; // Auto-refit dirty BVHs in render loop
}
```

**Defaults:**

- Auto-compute enabled for geometries ≥ 1 000 triangles
- Async worker builds for geometries ≥ 10 000 triangles
- Scene BVH enabled with auto-update
- Automatic per-geometry refit in the render loop

**Usage — customise at startup:**

```typescript
renderer.bvhConfig.autoComputeThreshold = 500; // lower threshold
renderer.bvhConfig.asyncBuildThreshold = 5000; // earlier async builds
renderer.bvhConfig.autoRefitGeometryBVH = false; // manual refit only
```

#### 4.2 Automatic BVH on Geometry Build

`Geometry.build()` now accepts optional `bvhConfig` and `workerManager`
parameters. The Renderer passes these automatically when building
geometries in `renderGroupings()`.

```typescript
build(
  device: GPUDevice,
  bvhConfig?: BVHConfig,
  workerManager?: BVHWorkerManager
) {
  // ... GPU buffer creation (unchanged) ...
  this.requiresBuild = false;

  // Auto-compute BVH if enabled and geometry exceeds threshold.
  if (bvhConfig?.autoComputeGeometryBVH && !this.bvh) {
    const triCount = this.getTriangleCount();
    if (triCount >= bvhConfig.autoComputeThreshold) {
      if (workerManager && triCount >= bvhConfig.asyncBuildThreshold) {
        // Large geometry — build in worker (fire-and-forget).
        this.computeBVHAsync(workerManager, options, bvhConfig.asyncBuildThreshold);
      } else {
        // Small/medium geometry — build synchronously.
        this.computeBVH(options);
      }
    }
  }
}
```

**Key design decisions:**

- `bvhConfig` is **optional** — callers like `AtmosphereSkybox.build()` and
  `vbo.build()` continue working without changes.
- Existing `computeBVH()` still works for manual control.
- The `!this.bvh` guard prevents double-building (e.g. terrain chunks that
  call `computeBVH()` before `build()`).

#### 4.3 Async BVH Building (Web Worker)

Large geometries (≥ 10 000 triangles by default) are built in a dedicated
Web Worker to avoid frame drops.

**Architecture:**

```
Main thread                           Worker thread
───────────                           ─────────────
Geometry.computeBVHAsync()
  → BVHWorkerManager.buildAsync()
    → copies vertices + indices
    → postMessage (transfer)  ───────→  BVHBuilder.build()
                                        serializeBVH()
    ← postMessage (transfer)  ←───────  SerializedBVH
  ← deserializeBVH()
  ← BVH.isReady = true
```

**Files created:**

| File                  | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `BVHConfig.ts`        | Config interface and defaults                              |
| `BVHSerializer.ts`    | Flat-array serialisation of BVH tree for `postMessage`     |
| `BVHWorkerManager.ts` | Worker lifecycle, request routing, promise management      |
| `worker/BVHWorker.ts` | Worker entry point — imports BVHBuilder, serialises result |

**Serialisation format:** Each `BVHNode` is packed into 11 consecutive floats
(isLeaf, bbox min/max xyz, triOffset, triCount, leftIdx, rightIdx). This
allows zero-copy transfer via `Transferable` buffers.

**Worker entry point** is compiled as a separate esbuild bundle
(`bvhWorker.js`) alongside `terrainWorker.js` — sharing the same source
classes (`BVHBuilder`, `BVHNode`, `Vector3` etc.) without duplication.

**Graceful fallback:** While the worker is running, `BVH.isReady = false`.
`raycast()` and `raycastFirst()` check this flag and return early, so
`Mesh.raycast()` falls back to brute-force until the BVH is ready.

**Usage — manual async build:**

```typescript
const geometry = new SomeComplexGeometry();
await geometry.computeBVHAsync(renderer.bvhWorkerManager!);
// geometry.bvh.isReady === true
```

#### 4.4 Dynamic Mesh Refit

When geometry vertices are modified at runtime (morph targets, procedural
animation, terrain deformation), the BVH must be updated.

**Automatic refit in render loop** (enabled by default):

```typescript
// In user code — mark geometry as dirty after modifying vertices:
geometry.vertices[index] = newValue;
geometry.bvhNeedsUpdate = true;

// In Renderer.render() — automatic refit happens before culling:
// renderer.bvhConfig.autoRefitGeometryBVH = true (default)
```

The Renderer walks all current render groups each frame and calls
`geometry.bvh.refit()` on any geometry with `bvhNeedsUpdate === true` and
`bvh.isReady === true`. Refit is much faster than rebuild — it updates
bounding boxes bottom-up without restructuring the tree.

**Manual refit** (when `autoRefitGeometryBVH = false`):

```typescript
geometry.vertices[index] = newValue;
geometry.bvh?.refit();
geometry.bvhNeedsUpdate = false;
```

#### 4.5 Renderer Integration

**New properties on `Renderer`:**

```typescript
bvhConfig: BVHConfig; // Global configuration
bvhWorkerManager: BVHWorkerManager | null; // Shared worker (created if asyncBuildThreshold > 0)
```

**Constructor** applies `DEFAULT_BVH_CONFIG`, creates SceneBVH and worker
manager based on config. The scene BVH threshold is synced from config
each frame.

**Render loop additions:**

1. Scene BVH threshold synced from `bvhConfig.sceneBVHUpdateThreshold`
2. `refitDirtyGeometryBVHs()` called before frustum culling
3. `geometry.build()` receives config + worker manager

**Disposal:** Worker is terminated and cleaned up in `renderer.dispose()`.

**Impact on existing code:**

- All existing `geometry.build(device)` calls continue to work (new params
  are optional).
- TerrainChunk already calls `computeBVH()` before `build()`, so the
  auto-compute guard (`!this.bvh`) prevents double-builds.
- No breaking changes to public API.

### Phase 5: Advanced Features

#### 5.1 Shapecast Support

For collision detection and custom queries:

```typescript
meshBVH.shapecast({
  intersectsBounds: (box: Box3) => boolean,
  intersectsTriangle: (tri: Triangle) => boolean,
});
```

#### 5.2 GPU BVH Traversal (Future)

For WebGPU compute shader raycasting:

- Store BVH in GPU buffer
- Implement GPU traversal in compute shader
- Useful for batch raycasting operations

#### 5.3 Instanced Mesh BVH

For instanced rendering with BVH:

- Single BVH for base geometry
- Transform ray to instance space
- Test against each instance

## File Structure

```
packages/rewild-renderer/
├── lib/
│   ├── acceleration/
│   │   ├── BVHNode.ts              # Core node structure + BVHOptions
│   │   ├── BVHBuilder.ts           # SAH & center split strategies
│   │   ├── BVH.ts                  # Per-geometry BVH (+ isReady, buildAsync)
│   │   ├── BVHConfig.ts            # ★ Phase 4: Global config interface + defaults
│   │   ├── BVHSerializer.ts        # ★ Phase 4: Flat-array serialise/deserialise
│   │   ├── BVHWorkerManager.ts     # ★ Phase 4: Worker lifecycle + promise routing
│   │   ├── SceneBVH.ts             # Scene-level BVH
│   │   ├── SceneBVHNode.ts         # Scene BVH node (holds Transform[])
│   │   ├── BVHUtils.ts             # countNodes, countLeaves, getMaxDepth
│   │   ├── index.ts                # Re-exports everything
│   │   └── worker/
│   │       └── BVHWorker.ts        # ★ Phase 4: Web Worker entry point
│   ├── core/
│   │   ├── Mesh.ts                 # Modified: uses geometry.bvh in raycast
│   │   ├── Raycaster.ts            # Modified: intersectBVHScene method
│   │   └── ...
│   ├── geometry/
│   │   ├── Geometry.ts             # Modified: computeBVHAsync, auto-compute in build
│   │   └── ...
│   └── Renderer.ts                 # Modified: bvhConfig, bvhWorkerManager, auto-refit
├── esbuild.js                      # Modified: bvhWorker entry point added
```

## Testing Strategy

### Unit Tests

- BVH builder correctness
- Ray intersection accuracy
- Refit correctness
- Frustum culling correctness

### Integration Tests

- End-to-end raycasting with BVH vs without
- Scene culling with various camera angles
- Dynamic mesh updates

### Performance Tests

- Raycast performance: simple mesh vs complex mesh
- Scene culling: small scene vs large scene
- Build time benchmarks

## Migration Path

### Backward Compatibility

- BVH is opt-in initially
- Existing code continues to work without changes
- Fallback to brute-force when BVH not available

### Gradual Adoption

1. **Phase 1**: ✅ Core BVH foundation — data structures, builder, raycasting
2. **Phase 2**: ✅ Per-geometry BVH on Geometry, transparent Mesh integration
3. **Phase 3**: ✅ Scene-level BVH for frustum culling and scene raycasting
4. **Phase 4**: ✅ Global config, auto-compute, async worker builds, dynamic refit

## Implementation Decisions

### Confirmed Decisions

1. **Memory Budget**: ✅ Target ~20% overhead relative to geometry size

   - Balanced approach: good query performance without excessive memory
   - Max leaf size: ~8 triangles
   - Max tree depth: 32 levels

2. **Build Timing**: ✅ Async/Worker for large geometries

   - Synchronous for geometries < 10 000 triangles
   - Worker thread for geometries ≥ 10 000 triangles
   - Auto-compute on `geometry.build()` for geometries ≥ 1 000 triangles
   - Fall back to brute-force raycasting until BVH ready (`bvh.isReady`)
   - Thresholds configurable via `BVHConfig`

3. **Debug Visualization**: ✅ Not needed in initial implementation

   - Can be added later as separate debug tool if needed
   - Focus on core functionality first

4. **Dynamic Refit**: ✅ Automatic in render loop

   - Renderer checks `bvhNeedsUpdate` for all render-group geometries each frame
   - Refit is bottom-up AABB recalculation (much faster than rebuild)
   - Can be disabled via `bvhConfig.autoRefitGeometryBVH = false`

5. **Worker Architecture**: ✅ Separate esbuild entry point
   - Shares source classes with main bundle (BVHBuilder, BVHNode, Vector3, etc.)
   - Serialisation via flat Float32Array — zero overhead for structured clone
   - Single shared worker instance managed by `BVHWorkerManager`
   - Request/response multiplexed via integer IDs

## References

- three-mesh-bvh: Primary inspiration for architecture
- PBR Book: BVH theory and SAH implementation
- Ingo Wald's papers: Fast BVH construction
- WebGPU Best Practices: Memory layout for potential GPU BVH
