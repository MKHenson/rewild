import { Vector3 } from 'rewild-common';
import { TerrainRenderer } from './TerrainRenderer';

/** A renderer holding one chunk at (0,0) whose heights ramp along +x. */
function rampedRenderer(gradientPerSample: number): TerrainRenderer {
  const terrain = new TerrainRenderer();
  const size = terrain.mapChunkSizeLod;
  terrain.chunkSize = (size - 1) * terrain.metersPerSample;

  const heights = new Float32Array(size * size);
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++)
      heights[z * size + x] = x * gradientPerSample;

  (terrain as any).terrainChunks.set('0,0', { heights });
  return terrain;
}

describe('sampleNormal', () => {
  const normal = new Vector3();

  it('is straight up over flat ground', () => {
    expect(rampedRenderer(0).sampleNormal(0, 0, normal)).toBe(true);
    expect(normal.x).toBeCloseTo(0);
    expect(normal.y).toBeCloseTo(1);
    expect(normal.z).toBeCloseTo(0);
  });

  it('leans away from the uphill direction on a slope', () => {
    const terrain = rampedRenderer(1);
    // One unit of height per sample step is a slope of 1/metersPerSample.
    const slope = 1 / terrain.metersPerSample;
    const length = Math.sqrt(slope * slope + 1);

    expect(terrain.sampleNormal(0, 0, normal)).toBe(true);
    expect(normal.x).toBeCloseTo(-slope / length);
    expect(normal.y).toBeCloseTo(1 / length);
    expect(normal.z).toBeCloseTo(0);
  });

  it('reports false where the chunk has no heights', () => {
    expect(new TerrainRenderer().sampleNormal(0, 0, normal)).toBe(false);
  });
});

describe('chunkIdAt', () => {
  it('matches the chunk sampleHeight reads from', () => {
    const terrain = rampedRenderer(0);
    const span = terrain.chunkSize;

    // Chunks are centred on their coordinate, so the origin is mid-chunk 0,0.
    expect(terrain.chunkIdAt(0, 0)).toBe('0,0');
    expect(terrain.chunkIdAt(span * 0.49, 0)).toBe('0,0');
    expect(terrain.chunkIdAt(span, 0)).toBe('1,0');
    expect(terrain.chunkIdAt(0, -span)).toBe('0,-1');
  });

  it('reports null before init has sized the chunks', () => {
    expect(new TerrainRenderer().chunkIdAt(0, 0)).toBeNull();
  });
});
