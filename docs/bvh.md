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

### Phase 4: Configuration & Control

#### 4.1 Global Configuration

Add to renderer initialization or config:

```typescript
export interface BVHConfig {
  // Per-geometry BVH
  autoComputeGeometryBVH: boolean; // Auto-build BVH for new geometries
  geometryBVHStrategy: 'sah' | 'center' | 'average';
  geometryBVHMaxDepth: number;
  geometryBVHMaxLeafTriangles: number;

  // Scene BVH
  enableSceneBVH: boolean;
  sceneBVHAutoUpdate: boolean;
  sceneBVHUpdateThreshold: number; // Num moved objects before rebuild
}
```

#### 4.2 Hybrid Build Strategy

Implement smart build triggers:

```typescript
// Auto-build for large geometries
geometry.build(device);
if (geometry.vertices.length > 1000 && config.autoComputeGeometryBVH) {
  geometry.computeBVH();
}

// Manual build for control
const geometry = new SphereGeometry(10, 64, 64);
geometry.computeBVH({ strategy: 'sah' });
```

#### 4.3 Dynamic Mesh Refit

```typescript
// When animating vertices
geometry.vertices[index] = newValue;
geometry.vertexBuffer.update(...);
geometry.bvhNeedsUpdate = true;

// In render loop
if (geometry.bvhNeedsUpdate && geometry.bvh?.options.enableRefit) {
  geometry.bvh.refit();
  geometry.bvhNeedsUpdate = false;
}
```

#### 4.4 Async BVH Building

For large geometries, build BVH in worker thread to avoid frame drops:

```typescript
// lib/acceleration/BVHWorker.ts
export class BVHWorkerManager {
  private worker: Worker;

  async buildBVH(geometry: Geometry, options: BVHOptions): Promise<BVHNode> {
    // Transfer geometry data to worker
    const geometryData = {
      vertices: geometry.vertices,
      indices: geometry.indices,
    };

    return new Promise((resolve) => {
      this.worker.postMessage({ type: 'build', data: geometryData, options });
      this.worker.onmessage = (e) => {
        if (e.data.type === 'complete') {
          resolve(e.data.bvh);
        }
      };
    });
  }
}

// Usage in Geometry
async computeBVH(options?: Partial<BVHOptions>): Promise<void> {
  const triangleCount = this.indices ? this.indices.length / 3 : this.vertices.length / 9;

  if (triangleCount < 1000) {
    // Small geometry: build synchronously
    this.bvh = new BVH(this, options);
    this.bvh.isReady = true;
  } else {
    // Large geometry: build in worker
    this.bvh = new BVH(this, options);
    this.bvh.isReady = false;

    const bvhData = await workerManager.buildBVH(this, this.bvh.options);
    this.bvh.root = bvhData;
    this.bvh.isReady = true;
  }
}
```

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
│   ├── acceleration/           # New directory
│   │   ├── BVHNode.ts         # Core node structure
│   │   ├── BVHBuilder.ts      # Build strategies (SAH, center)
│   │   ├── BVH.ts             # Per-geometry BVH (lives in geometry.bvh)
│   │   ├── SceneBVH.ts        # Scene-level BVH
│   │   ├── BVHWorker.ts       # Worker manager for async builds
│   │   ├── BVHUtils.ts        # Helper functions
│   │   └── index.ts           # Exports
│   ├── core/
│   │   ├── Mesh.ts            # Modified: use BVH in raycast
│   │   ├── Raycaster.ts       # Modified: scene BVH integration
│   │   └── ...
│   ├── geometry/
│   │   ├── Geometry.ts        # Modified: add BVH properties/methods
│   │   └── ...
│   └── Renderer.ts            # Modified: scene BVH integration
├── workers/                    # New directory
│   └── bvh-builder.worker.ts  # Web worker for BVH construction
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

1. **Phase 1**: Add BVH to high-poly meshes only
2. **Phase 2**: Enable scene BVH for culling
3. **Phase 3**: Make BVH default for all geometries > threshold
4. **Phase 4**: Eventually deprecate non-BVH paths

## Implementation Decisions

### Confirmed Decisions

1. **Memory Budget**: ✅ Target ~20% overhead relative to geometry size

   - Balanced approach: good query performance without excessive memory
   - Max leaf size: ~8 triangles
   - Max tree depth: 32 levels

2. **Build Timing**: ✅ Async/Worker for large geometries

   - Synchronous for small meshes (< 1000 triangles)
   - Worker thread for large meshes (> 1000 triangles)
   - Fall back to brute-force raycasting until BVH ready
   - Add `geometry.bvh.isReady` flag

3. **Debug Visualization**: ✅ Not needed in initial implementation
   - Can be added later as separate debug tool if needed
   - Focus on core functionality first

## References

- three-mesh-bvh: Primary inspiration for architecture
- PBR Book: BVH theory and SAH implementation
- Ingo Wald's papers: Fast BVH construction
- WebGPU Best Practices: Memory layout for potential GPU BVH
