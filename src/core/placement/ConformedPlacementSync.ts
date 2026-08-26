import { IAssetPlacement } from 'models';
import { Quaternion, Vector3 } from 'rewild-common';
import { Renderer, Transform } from 'rewild-renderer';
import { TerrainEvent } from 'rewild-renderer/lib/renderers/terrain/TerrainRenderer';
import { resolvePlacement } from './ConformedPlacement';

/**
 * Hands each conformed object and its transform to `visit`, which re-derives it
 * and reports whether it moved.
 */
export type ConformTargetVisitor = (
  visit: (placement: IAssetPlacement, transform: Transform) => boolean
) => void;

const _rotation = new Quaternion();
// Resolved into scratch first: a placement whose chunk has no heights falls
// back to its stored vec3, and applying that would drag an object already
// standing correctly back to wherever it was last saved.
const _position = new Vector3();

/**
 * Keeps conformed objects standing on the ground as the ground moves.
 *
 * Sculpting, loading a chunk snapshot, changing the world seed and re-tuning a
 * climate preset all move the terrain, and hooking each of them would be four
 * chances to forget one. They have a single point in common instead: whatever
 * moved the ground, the chunk rebuilds and raises `chunk-loaded`. Listening
 * there covers all four — and covers a chunk streaming in after the objects
 * standing on it mounted, which no author action triggers at all.
 *
 * Re-deriving is idempotent, so a `chunk-loaded` raised by a plain LOD swap
 * costs a re-sample and changes nothing.
 */
export class ConformedPlacementSync {
  private renderer: Renderer;
  private visitTargets: ConformTargetVisitor;

  // Bound once: both run per chunk event.
  private listener: (event: TerrainEvent) => void;
  private visitDelegate: (
    placement: IAssetPlacement,
    transform: Transform
  ) => boolean;
  // Chunk the in-flight sync is for, or null to accept every target.
  private chunkFilter: string | null = null;

  constructor(renderer: Renderer, visitTargets: ConformTargetVisitor) {
    this.renderer = renderer;
    this.visitTargets = visitTargets;
    this.listener = (event) => {
      if (event.type === 'chunk-loaded') this.resolveChunk(event.chunk.id);
    };
    this.visitDelegate = (placement, transform) =>
      this.resolveTarget(placement, transform);
  }

  start(): void {
    this.renderer.terrainRenderer.dispatcher.add(this.listener);
  }

  stop(): void {
    this.renderer.terrainRenderer.dispatcher.remove(this.listener);
  }

  /** Re-derives the conformed objects standing on one chunk. */
  resolveChunk(chunkId: string): void {
    this.chunkFilter = chunkId;
    this.visitTargets(this.visitDelegate);
    this.chunkFilter = null;
  }

  /** Re-derives every conformed object, whichever chunk it stands on. */
  resolveAll(): void {
    this.chunkFilter = null;
    this.visitTargets(this.visitDelegate);
  }

  private resolveTarget(
    placement: IAssetPlacement,
    transform: Transform
  ): boolean {
    if (!placement.conform) return false;

    const terrain = this.renderer.terrainRenderer;
    if (
      this.chunkFilter !== null &&
      terrain.chunkIdAt(placement.position[0], placement.position[2]) !==
        this.chunkFilter
    ) {
      return false;
    }

    // False means the heights are not there to derive from. Leave the object
    // untouched and wait for the chunk that owns it to load — the event that
    // brought us here in the first place.
    if (!resolvePlacement(placement, terrain, _position, _rotation))
      return false;

    transform.position.copy(_position);
    transform.rotation.setFromQuaternion(_rotation);
    // The object's world AABB just changed; without this a click or a drag
    // still hits where it used to be.
    this.renderer.sceneBVH?.markObjectMoved(transform);
    return true;
  }
}
