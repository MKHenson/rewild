import {
  CHUNK_SNAPSHOT_FLAG_COMPRESSED,
  serializeChunkSnapshot,
} from 'rewild-renderer/lib/renderers/terrain/ChunkSnapshot';
import { createChunkSnapshotProvider } from './chunk-snapshots';
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
});
