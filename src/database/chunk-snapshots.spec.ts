import {
  CHUNK_SNAPSHOT_FLAG_COMPRESSED,
  serializeChunkSnapshot,
} from 'rewild-renderer/lib/renderers/terrain/ChunkSnapshot';
import {
  createChunkSnapshotProvider,
  writeChunkSnapshot,
} from './chunk-snapshots';
import { db } from './database';
import { installOPFSMock } from './opfs-mock';
import { clearDatabase } from './local-db';

const LEVEL_ID = 'level1';
const SIZE = 9;

function fixtureHeights(): Float32Array {
  const heights = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < heights.length; i++) heights[i] = i * 1.5;
  return heights;
}

describe('createChunkSnapshotProvider', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    await clearDatabase('rewild');
    localStorage.clear();
    installOPFSMock();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns the stored heights for a saved chunk', async () => {
    const heights = fixtureHeights();
    await db.assets.write(LEVEL_ID, 'chunk', '32_16.bin', serializeChunkSnapshot(heights, SIZE, SIZE));

    const provider = createChunkSnapshotProvider(LEVEL_ID);
    const result = await provider(32, 16);

    expect(result).toEqual(heights);
  });

  it('resolves null for a chunk with no snapshot (clean no-op → generate)', async () => {
    const provider = createChunkSnapshotProvider(LEVEL_ID);
    expect(await provider(5, -3)).toBeNull();
  });

  it('does not leak snapshots across levels', async () => {
    await db.assets.write('other-level', 'chunk', '0_0.bin', serializeChunkSnapshot(fixtureHeights(), SIZE, SIZE));

    const provider = createChunkSnapshotProvider(LEVEL_ID);
    expect(await provider(0, 0)).toBeNull();
  });

  it('resolves null (and warns) for a corrupt blob', async () => {
    await db.assets.write(LEVEL_ID, 'chunk', '0_0.bin', new Uint8Array([1, 2, 3]).buffer);

    const provider = createChunkSnapshotProvider(LEVEL_ID);
    expect(await provider(0, 0)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('resolves null for a snapshot with the reserved compressed flag set', async () => {
    const blob = serializeChunkSnapshot(fixtureHeights(), SIZE, SIZE);
    new DataView(blob).setUint32(12, CHUNK_SNAPSHOT_FLAG_COMPRESSED, true);
    await db.assets.write(LEVEL_ID, 'chunk', '0_0.bin', blob);

    const provider = createChunkSnapshotProvider(LEVEL_ID);
    expect(await provider(0, 0)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  describe('level deletion', () => {
    it('deleting a level removes its chunk snapshots (blob + metadata)', async () => {
      const level = await db.levels.add({
        name: 'doomed',
        projectId: 'p1',
        hasTerrain: true,
      } as any);
      await writeChunkSnapshot(level.id, 0, 0, fixtureHeights(), SIZE);

      const provider = createChunkSnapshotProvider(level.id);
      expect(await provider(0, 0)).not.toBeNull();

      await db.levels.remove(level.id);

      expect(await provider(0, 0)).toBeNull();
      const dirty = await db.assets.getDirty();
      expect(dirty.some((d) => d.levelId === level.id)).toBe(false);
    });

    it('deleting a level leaves another level\'s snapshots intact', async () => {
      const doomed = await db.levels.add({ name: 'doomed', projectId: 'p1' } as any);
      await writeChunkSnapshot(doomed.id, 0, 0, fixtureHeights(), SIZE);
      const kept = fixtureHeights().map((h) => h * 2);
      await writeChunkSnapshot('level-keep', 1, 1, kept, SIZE);

      await db.levels.remove(doomed.id);

      const provider = createChunkSnapshotProvider('level-keep');
      expect(await provider(1, 1)).toEqual(kept);
    });
  });

  describe('writeChunkSnapshot', () => {
    it('round-trips: written heights come back through the provider', async () => {
      const heights = fixtureHeights();
      await writeChunkSnapshot(LEVEL_ID, 5, -3, heights, SIZE);

      const provider = createChunkSnapshotProvider(LEVEL_ID);
      expect(await provider(5, -3)).toEqual(heights);
    });

    it('writes are dirty so the next sync pushes them', async () => {
      await writeChunkSnapshot(LEVEL_ID, 0, 0, fixtureHeights(), SIZE);

      const dirty = await db.assets.getDirty();
      expect(dirty).toHaveLength(1);
      expect(dirty[0].assetType).toBe('chunk');
      expect(dirty[0].filename).toBe('0_0.bin');
    });

    it('re-edits override: same asset row re-dirtied, latest heights win', async () => {
      const first = fixtureHeights();
      const id = await writeChunkSnapshot(LEVEL_ID, 0, 0, first, SIZE);

      // Simulate a completed sync, then wait so the re-write's updatedAt advances.
      const record = await db.assets.getOne(id);
      await db.assets.markSynced(id, record!.updatedAt, null);
      expect(await db.assets.getDirty()).toHaveLength(0);
      await new Promise((r) => setTimeout(r, 5));

      const second = fixtureHeights().map((h) => h + 10);
      const secondId = await writeChunkSnapshot(LEVEL_ID, 0, 0, second, SIZE);

      expect(secondId).toBe(id); // same metadata row, same storage key
      const dirty = await db.assets.getDirty();
      expect(dirty).toHaveLength(1);

      const provider = createChunkSnapshotProvider(LEVEL_ID);
      expect(await provider(0, 0)).toEqual(second);
    });
  });
});
