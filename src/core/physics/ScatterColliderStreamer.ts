import type { Collider, ColliderDesc } from '@dimforge/rapier3d-compat';
import {
  PhysicsShape,
  SCATTER_INSTANCE_STRIDE,
  ScatterInstances,
  getScatterLayer,
} from 'rewild-renderer';
import { createScatterColliderDesc } from './ColliderShapes';

// Streams scatter colliders around the viewer.
//
// A forest has effectively unbounded trees and Rapier colliders are not free at
// any count, so instances hold one only while the viewer is near — and never
// more than the budget, nearer instances winning. Distance rather than frustum:
// frustum eviction deletes the tree you are leaning on when you turn around.
//
// Two radii give the band hysteresis: an instance gains its collider inside
// the activate radius and keeps it out to the deactivate radius, so nothing
// thrashes at either boundary. The budget gets the same treatment — when it is
// saturated an active collider ranks as though it were a band's width nearer,
// so a newcomer has to be clearly closer to take its slot.

/** Metres from the viewer inside which an instance gains a collider. */
export const SCATTER_COLLIDER_ACTIVATE_DISTANCE = 40;
/** Metres beyond which an instance loses the collider it holds. */
export const SCATTER_COLLIDER_DEACTIVATE_DISTANCE = 50;
/** Scatter colliders resident at once, across every chunk. */
export const SCATTER_COLLIDER_BUDGET = 512;
/** Metres the viewer moves before the band is re-evaluated. */
const MOVE_THRESHOLD = 2;

// Their own group so the terrain-only ground ray passes through them; the
// character controller filters nothing and still walks into them.
const SCATTER_BIT = 2;
const SCATTER_GROUPS = (SCATTER_BIT << 16) | 0xffff;

// What the streamer needs of Rapier's World — narrowed so a test can stand in
// for it without the wasm.
export interface ColliderWorld {
  createCollider(desc: ColliderDesc): Collider;
  removeCollider(collider: Collider, wakeUp: boolean): void;
}

type Rapier = typeof import('@dimforge/rapier3d-compat');

interface ColliderLayer {
  name: string;
  shape: PhysicsShape;
  instances: ScatterInstances;
  /** Aligned to the instance list: the collider each holds, or null. */
  colliders: (Collider | null)[];
  active: number;
}

interface ColliderChunk {
  id: string;
  originX: number;
  originZ: number;
  halfSize: number;
  layers: ColliderLayer[];
  active: number;
}

export interface ScatterColliderStats {
  chunks: number;
  candidates: number;
  active: number;
  budget: number;
  activateDistance: number;
  deactivateDistance: number;
  layers: { layer: string; candidates: number; active: number }[];
}

const BAND = SCATTER_COLLIDER_DEACTIVATE_DISTANCE - SCATTER_COLLIDER_ACTIVATE_DISTANCE;
const ACTIVATE_SQ = SCATTER_COLLIDER_ACTIVATE_DISTANCE ** 2;
const DEACTIVATE_SQ = SCATTER_COLLIDER_DEACTIVATE_DISTANCE ** 2;
const MOVE_THRESHOLD_SQ = MOVE_THRESHOLD ** 2;

export class ScatterColliderStreamer {
  private chunks: ColliderChunk[] = [];
  private byId = new Map<string, ColliderChunk>();
  private lastX = NaN;
  private lastY = NaN;
  private lastZ = NaN;
  private dirty = false;

  // The eligible set gathered by an update — everything inside its own radius
  // — kept in typed columns so a walk that crosses the movement threshold
  // every few frames allocates nothing. Grown by doubling on the rare update
  // that outruns them.
  private capacity = 1024;
  private rank = new Float32Array(this.capacity);
  private chunkOf = new Int32Array(this.capacity);
  private layerOf = new Int32Array(this.capacity);
  private indexOf = new Int32Array(this.capacity);
  private order = new Uint32Array(this.capacity);

  constructor(
    private R: Rapier,
    private world: ColliderWorld,
    private budget = SCATTER_COLLIDER_BUDGET
  ) {}

  /**
   * Replaces a chunk's candidates with the instances it just generated. Only
   * layers with a collider proxy are kept; the rest are walked through.
   * Anything the chunk held is released — a rebuild moved every instance.
   */
  setChunk(
    id: string,
    originX: number,
    originZ: number,
    halfSize: number,
    instances: ScatterInstances[]
  ): void {
    this.removeChunk(id);

    const layers: ColliderLayer[] = [];
    for (const layerInstances of instances) {
      const shape = getScatterLayer(layerInstances.layer).collider;
      if (!shape || layerInstances.count === 0) continue;
      layers.push({
        name: layerInstances.layer,
        shape,
        instances: layerInstances,
        colliders: new Array(layerInstances.count).fill(null),
        active: 0,
      });
    }
    if (layers.length === 0) return;

    const chunk = { id, originX, originZ, halfSize, layers, active: 0 };
    this.chunks.push(chunk);
    this.byId.set(id, chunk);
    this.dirty = true;
  }

  removeChunk(id: string): void {
    const chunk = this.byId.get(id);
    if (!chunk) return;

    this.deactivateChunk(chunk);
    this.byId.delete(id);
    const at = this.chunks.indexOf(chunk);
    const last = this.chunks.pop()!;
    if (last !== chunk) this.chunks[at] = last;
    this.dirty = true;
  }

  /** Re-evaluates the band from the viewer's position, once it has moved. */
  update(viewerX: number, viewerY: number, viewerZ: number): void {
    const dx = viewerX - this.lastX;
    const dy = viewerY - this.lastY;
    const dz = viewerZ - this.lastZ;
    const moved = dx * dx + dy * dy + dz * dz;
    if (!this.dirty && moved < MOVE_THRESHOLD_SQ) return;

    this.dirty = false;
    this.lastX = viewerX;
    this.lastY = viewerY;
    this.lastZ = viewerZ;

    const eligible = this.gather(viewerX, viewerY, viewerZ);

    if (eligible <= this.budget) {
      for (let e = 0; e < eligible; e++) this.activate(e);
      return;
    }

    const order = this.order.subarray(0, eligible);
    for (let e = 0; e < eligible; e++) order[e] = e;
    const rank = this.rank;
    order.sort((a, b) => rank[a] - rank[b]);

    for (let e = 0; e < this.budget; e++) this.activate(order[e]);
    for (let e = this.budget; e < eligible; e++) this.deactivate(order[e]);
  }

  // Walks every candidate near enough to matter, releasing those that left the
  // band on the way, and columns the rest — held or wanted — by how they rank
  // for a slot. Returns how many it columned.
  private gather(viewerX: number, viewerY: number, viewerZ: number): number {
    let eligible = 0;

    for (let c = 0; c < this.chunks.length; c++) {
      const chunk = this.chunks[c];

      // A chunk whose nearest edge is past the outer radius cannot hold
      // anything eligible, however tall its ground.
      const edgeX = Math.max(Math.abs(viewerX - chunk.originX) - chunk.halfSize, 0);
      const edgeZ = Math.max(Math.abs(viewerZ - chunk.originZ) - chunk.halfSize, 0);
      if (edgeX * edgeX + edgeZ * edgeZ > DEACTIVATE_SQ) {
        if (chunk.active > 0) this.deactivateChunk(chunk);
        continue;
      }

      for (let l = 0; l < chunk.layers.length; l++) {
        const layer = chunk.layers[l];
        const data = layer.instances.data;
        const colliders = layer.colliders;

        for (let i = 0; i < layer.instances.count; i++) {
          const base = i * SCATTER_INSTANCE_STRIDE;
          const dx = chunk.originX + data[base] - viewerX;
          const dy = data[base + 1] - viewerY;
          const dz = chunk.originZ + data[base + 2] - viewerZ;
          const distSq = dx * dx + dy * dy + dz * dz;
          const held = colliders[i] !== null;

          if (held) {
            if (distSq > DEACTIVATE_SQ) {
              this.release(chunk, layer, i);
              continue;
            }
          } else if (distSq > ACTIVATE_SQ) continue;

          if (eligible === this.capacity) this.grow();
          this.rank[eligible] = Math.sqrt(distSq) - (held ? BAND : 0);
          this.chunkOf[eligible] = c;
          this.layerOf[eligible] = l;
          this.indexOf[eligible] = i;
          eligible++;
        }
      }
    }

    return eligible;
  }

  private grow(): void {
    this.capacity *= 2;
    const rank = new Float32Array(this.capacity);
    rank.set(this.rank);
    this.rank = rank;
    const chunkOf = new Int32Array(this.capacity);
    chunkOf.set(this.chunkOf);
    this.chunkOf = chunkOf;
    const layerOf = new Int32Array(this.capacity);
    layerOf.set(this.layerOf);
    this.layerOf = layerOf;
    const indexOf = new Int32Array(this.capacity);
    indexOf.set(this.indexOf);
    this.indexOf = indexOf;
    this.order = new Uint32Array(this.capacity);
  }

  private activate(e: number): void {
    const chunk = this.chunks[this.chunkOf[e]];
    const layer = chunk.layers[this.layerOf[e]];
    const i = this.indexOf[e];
    if (layer.colliders[i]) return;

    const desc = createScatterColliderDesc(
      this.R,
      layer.shape,
      layer.instances,
      i,
      chunk.originX,
      0,
      chunk.originZ
    ).setCollisionGroups(SCATTER_GROUPS);
    layer.colliders[i] = this.world.createCollider(desc);
    layer.active++;
    chunk.active++;
  }

  private deactivate(e: number): void {
    const chunk = this.chunks[this.chunkOf[e]];
    const layer = chunk.layers[this.layerOf[e]];
    const i = this.indexOf[e];
    if (layer.colliders[i]) this.release(chunk, layer, i);
  }

  private release(chunk: ColliderChunk, layer: ColliderLayer, i: number): void {
    this.world.removeCollider(layer.colliders[i]!, false);
    layer.colliders[i] = null;
    layer.active--;
    chunk.active--;
  }

  private deactivateChunk(chunk: ColliderChunk): void {
    for (const layer of chunk.layers) {
      if (layer.active === 0) continue;
      for (let i = 0; i < layer.colliders.length; i++)
        if (layer.colliders[i]) this.release(chunk, layer, i);
    }
  }

  get activeCount(): number {
    let active = 0;
    for (const chunk of this.chunks) active += chunk.active;
    return active;
  }

  /** For the console: what the band holds against what it could. */
  stats(): ScatterColliderStats {
    const layers = new Map<string, { candidates: number; active: number }>();
    let candidates = 0;
    let active = 0;

    for (const chunk of this.chunks)
      for (const layer of chunk.layers) {
        const row = layers.get(layer.name) ?? { candidates: 0, active: 0 };
        row.candidates += layer.instances.count;
        row.active += layer.active;
        layers.set(layer.name, row);
        candidates += layer.instances.count;
        active += layer.active;
      }

    return {
      chunks: this.chunks.length,
      candidates,
      active,
      budget: this.budget,
      activateDistance: SCATTER_COLLIDER_ACTIVATE_DISTANCE,
      deactivateDistance: SCATTER_COLLIDER_DEACTIVATE_DISTANCE,
      layers: Array.from(layers, ([layer, row]) => ({ layer, ...row })),
    };
  }

  dispose(): void {
    for (const chunk of this.chunks) this.deactivateChunk(chunk);
    this.chunks.length = 0;
    this.byId.clear();
  }
}
