import { Vector2 } from 'rewild-common';
import { Renderer, resolveClimatePreset } from 'rewild-renderer';
import { TerrainChunk } from 'rewild-renderer/lib/renderers/terrain/TerrainChunk';
import { generateBiomeBlendedHeightMap } from 'rewild-renderer/lib/renderers/terrain/Noise';

/**
 * Gets chunk heights in memory for the terrain brushes: a chunk's saved
 * snapshot if one exists, else its generated baseline. Each chunk resolves
 * once; it is editable from the next pointer event.
 */
export class ChunkHeightLoader {
  private pending = new Set<string>();

  constructor(private renderer: Renderer) {}

  /** The chunk's heights, or null while they are read. */
  get(cx: number, cy: number): Float32Array | null {
    const chunk = this.renderer.terrainRenderer.terrainChunks.get(
      `${cx},${cy}`
    );
    if (!chunk) return null;
    if (chunk.heights) return chunk.heights;
    this.ensure(chunk);
    return null;
  }

  ensure(chunk: TerrainChunk) {
    if (chunk.heights || this.pending.has(chunk.id)) return;
    this.pending.add(chunk.id);

    const terrain = this.renderer.terrainRenderer;
    chunk
      .resolveHeights(terrain.snapshotProvider)
      .then((heights) => {
        if (chunk.disposed) return;
        // Population, not an edit: the meshes already show this baseline.
        chunk.populateHeights(heights ?? this.generateBaseline(chunk));
      })
      .finally(() => {
        this.pending.delete(chunk.id);
      });
  }

  /** Starts reading the heights of every chunk within `radius` of (x, z). */
  prefetch(x: number, z: number, radius: number) {
    const terrain = this.renderer.terrainRenderer;
    const span = terrain.chunkSize;
    const half = span / 2;
    const cxMin = Math.ceil((x - radius - half) / span);
    const cxMax = Math.floor((x + radius + half) / span);
    const cyMin = Math.ceil((z - radius - half) / span);
    const cyMax = Math.floor((z + radius + half) / span);
    for (let cy = cyMin; cy <= cyMax; cy++)
      for (let cx = cxMin; cx <= cxMax; cx++) {
        const chunk = terrain.terrainChunks.get(`${cx},${cy}`);
        if (chunk && !chunk.heights) this.ensure(chunk);
      }
  }

  // The chunk's unedited heightfield, identical to what the terrain worker
  // generates for it.
  private generateBaseline(chunk: TerrainChunk): Float32Array {
    const size = this.renderer.terrainRenderer.mapChunkSizeLod;
    return generateBiomeBlendedHeightMap(
      size,
      size,
      chunk.seed,
      new Vector2(chunk.coord.x * (size - 1), chunk.coord.y * (size - 1)),
      resolveClimatePreset(chunk.climatePreset),
      chunk.seaLevel
    );
  }
}
