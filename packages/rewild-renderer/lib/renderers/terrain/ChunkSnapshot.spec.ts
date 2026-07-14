import {
  CHUNK_SNAPSHOT_FLAG_COMPRESSED,
  CHUNK_SNAPSHOT_HEADER_BYTES,
  CHUNK_SNAPSHOT_VERSION,
  chunkSnapshotFilename,
  deserializeChunkSnapshot,
  serializeChunkSnapshot,
} from './ChunkSnapshot';

function sampleHeights(width: number, height: number): Float32Array {
  const heights = new Float32Array(width * height);
  for (let i = 0; i < heights.length; i++) heights[i] = Math.sin(i * 0.13) * 87.5;
  return heights;
}

describe('ChunkSnapshot', () => {
  describe('filename', () => {
    it('keys the blob by integer chunk coordinates', () => {
      expect(chunkSnapshotFilename(32, 16)).toBe('32_16.bin');
      expect(chunkSnapshotFilename(-3, 0)).toBe('-3_0.bin');
    });
  });

  describe('round-trip', () => {
    it('serialises and deserialises a heightfield without loss', () => {
      const heights = sampleHeights(241, 241);
      const blob = serializeChunkSnapshot(heights, 241, 241);

      expect(blob.byteLength).toBe(CHUNK_SNAPSHOT_HEADER_BYTES + 241 * 241 * 4);

      const snapshot = deserializeChunkSnapshot(blob);
      expect(snapshot.version).toBe(CHUNK_SNAPSHOT_VERSION);
      expect(snapshot.width).toBe(241);
      expect(snapshot.height).toBe(241);
      expect(snapshot.compressed).toBe(false);
      expect(snapshot.heights).toEqual(heights);
    });

    it('rejects a heights array that does not match the dimensions', () => {
      expect(() => serializeChunkSnapshot(new Float32Array(10), 4, 4)).toThrow();
      expect(() => serializeChunkSnapshot(new Float32Array(16), 0, 16)).toThrow();
      expect(() => serializeChunkSnapshot(new Float32Array(16), 4.5, 4)).toThrow();
    });
  });

  describe('deserialise validation', () => {
    it('rejects a buffer smaller than the header', () => {
      expect(() => deserializeChunkSnapshot(new ArrayBuffer(8))).toThrow(/header/);
    });

    it('rejects an unsupported version', () => {
      const blob = serializeChunkSnapshot(sampleHeights(4, 4), 4, 4);
      new DataView(blob).setUint32(0, CHUNK_SNAPSHOT_VERSION + 1, true);
      expect(() => deserializeChunkSnapshot(blob)).toThrow(/version/);
    });

    it('rejects the reserved compressed flag until compression lands', () => {
      const blob = serializeChunkSnapshot(sampleHeights(4, 4), 4, 4);
      new DataView(blob).setUint32(12, CHUNK_SNAPSHOT_FLAG_COMPRESSED, true);
      expect(() => deserializeChunkSnapshot(blob)).toThrow(/[Cc]ompressed/);
    });

    it('rejects a body that does not match the declared dimensions', () => {
      const blob = serializeChunkSnapshot(sampleHeights(4, 4), 4, 4);
      const truncated = blob.slice(0, blob.byteLength - 4);
      expect(() => deserializeChunkSnapshot(truncated)).toThrow(/body/);
    });
  });
});
