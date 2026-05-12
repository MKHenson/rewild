import { LocalAssetStore } from './local-asset-store';
import { authService } from '../api/auth/auth-service';
import { installOPFSMock } from './opfs-mock';
import { mockResponse, mockFetch } from '../test-utils';

describe('LocalAssetStore', () => {
  let store: LocalAssetStore;

  beforeEach(() => {
    localStorage.clear();
    installOPFSMock();
    store = new LocalAssetStore();
  });

  describe('read / write', () => {
    it('writes and reads back binary data', async () => {
      const data = new Uint8Array([1, 2, 3, 4]).buffer;
      await store.write('level1', 'chunk', '32_16.bin', data);

      const result = await store.read('level1', 'chunk', '32_16.bin');
      expect(result).not.toBeNull();
      expect(new Uint8Array(result!)).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('returns null for an asset that has never been written', async () => {
      const result = await store.read('level1', 'chunk', 'missing.bin');
      expect(result).toBeNull();
    });

    it('overwrites binary data on a second write to the same path', async () => {
      await store.write('level1', 'chunk', 'overwrite.bin', new Uint8Array([1, 2]).buffer);
      await store.write('level1', 'chunk', 'overwrite.bin', new Uint8Array([9, 8, 7]).buffer);

      const result = await store.read('level1', 'chunk', 'overwrite.bin');
      expect(new Uint8Array(result!)).toEqual(new Uint8Array([9, 8, 7]));
    });
  });

  describe('dirty detection', () => {
    it('a newly written asset has syncedAt=0 and is dirty', async () => {
      await store.write('level1', 'chunk', 'terrain.bin', new Uint8Array([5, 6]).buffer);

      const dirty = await store.getDirty();
      expect(dirty.length).toBe(1);
      expect(dirty[0].syncedAt).toBe(0);
      expect(dirty[0].levelId).toBe('level1');
    });

    it('re-writing a synced asset marks it dirty again', async () => {
      const id = await store.write('level1', 'chunk', 'a.bin', new Uint8Array([1]).buffer);

      // Mark synced at the same timestamp as updatedAt so the record is clean
      const record = await store.getOne(id);
      await store.markSynced(id, record!.updatedAt, null);
      expect(await store.getDirty()).toHaveLength(0);

      // Wait briefly so Date.now() advances past syncedAt, then re-write
      await new Promise((r) => setTimeout(r, 5));
      await store.write('level1', 'chunk', 'a.bin', new Uint8Array([2]).buffer);

      const dirty = await store.getDirty();
      expect(dirty.map((d) => d.id)).toContain(id);
    });

    it('a second write to the same path does not create a duplicate metadata record', async () => {
      await store.write('level1', 'chunk', 'dup.bin', new Uint8Array([1]).buffer);
      await store.write('level1', 'chunk', 'dup.bin', new Uint8Array([2]).buffer);

      const dirty = await store.getDirty();
      const matches = dirty.filter((d) => d.levelId === 'level1' && d.filename === 'dup.bin');
      expect(matches).toHaveLength(1);
    });
  });

  describe('removeByLevel', () => {
    it('removes OPFS binary files for the deleted level', async () => {
      await store.write('level-del', 'chunk', 'x.bin', new Uint8Array([9]).buffer);
      await store.removeByLevel('level-del');

      expect(await store.read('level-del', 'chunk', 'x.bin')).toBeNull();
    });

    it('removes metadata records for the deleted level', async () => {
      await store.write('level-del', 'chunk', 'x.bin', new Uint8Array([9]).buffer);
      await store.write('level-del', 'chunk', 'y.bin', new Uint8Array([8]).buffer);
      await store.removeByLevel('level-del');

      const dirty = await store.getDirty();
      expect(dirty.every((d) => d.levelId !== 'level-del')).toBe(true);
    });

    it('does not affect assets belonging to other levels', async () => {
      await store.write('level-del', 'chunk', 'x.bin', new Uint8Array([9]).buffer);
      await store.write('level-keep', 'chunk', 'z.bin', new Uint8Array([7]).buffer);

      await store.removeByLevel('level-del');

      const kept = await store.read('level-keep', 'chunk', 'z.bin');
      expect(kept).not.toBeNull();
      expect(new Uint8Array(kept!)).toEqual(new Uint8Array([7]));

      const dirty = await store.getDirty();
      expect(dirty.some((d) => d.levelId === 'level-keep')).toBe(true);
    });

    it('does not throw when removing a level that has no assets', async () => {
      await expect(store.removeByLevel('nonexistent-level')).resolves.toBeUndefined();
    });
  });

  describe('sync()', () => {
    beforeEach(() => {
      jest.spyOn(authService, 'getToken').mockReturnValue(null);
      jest.spyOn(authService, 'refreshToken').mockResolvedValue(null);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('is a no-op when not authenticated', async () => {
      await store.write('level1', 'chunk', 'a.bin', new Uint8Array([1]).buffer);
      global.fetch = jest.fn();

      await store.sync();

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('uploads dirty assets via the presigned URL flow and marks them synced', async () => {
      jest.spyOn(authService, 'getToken').mockReturnValue('token');
      await store.write('level1', 'chunk', 'a.bin', new Uint8Array([1, 2, 3]).buffer);

      mockFetch(
        // POST /api/assets/upload-url
        mockResponse(200, { uploadUrl: 'http://minio/presigned', publicUrl: 'http://minio/public/a.bin', storageKey: 'levels/level1/chunk/a.bin' }),
        // PUT to presigned URL (direct to S3)
        mockResponse(200),
        // POST /api/assets/confirm
        mockResponse(200),
        // GET /api/assets (pull phase — empty, nothing to download)
        mockResponse(200, []),
      );

      await store.sync();

      const dirty = await store.getDirty();
      expect(dirty).toHaveLength(0);
    });

    it('sets syncError on a dirty asset when the presigned upload fails', async () => {
      jest.spyOn(authService, 'getToken').mockReturnValue('token');
      const id = await store.write('level1', 'chunk', 'b.bin', new Uint8Array([9]).buffer);

      mockFetch(
        // POST /api/assets/upload-url
        mockResponse(200, { uploadUrl: 'http://minio/presigned', publicUrl: 'http://minio/public/b.bin', storageKey: 'levels/level1/chunk/b.bin' }),
        // PUT to presigned URL — fails
        mockResponse(503),
        // GET /api/assets (pull phase)
        mockResponse(200, []),
      );

      await store.sync();

      const record = await store.getOne(id);
      expect(record!.syncError).toMatch(/503/);
      expect(record!.syncedAt).toBe(0);
    });

    it('downloads and caches server assets not present locally', async () => {
      jest.spyOn(authService, 'getToken').mockReturnValue('token');
      const binary = new Uint8Array([7, 8, 9]);

      mockFetch(
        // GET /api/assets — server has one asset the client doesn't
        mockResponse(200, [{ id: 'srv-1', levelId: 'level-remote', assetType: 'chunk', filename: 'remote.bin', publicUrl: 'http://minio/remote.bin' }]),
        // GET publicUrl — the binary content
        { ok: true, status: 200, arrayBuffer: () => Promise.resolve(binary.buffer) } as unknown as Response,
      );

      // No dirty assets, so push phase is skipped
      await store.sync();

      const cached = await store.read('level-remote', 'chunk', 'remote.bin');
      expect(cached).not.toBeNull();
      expect(new Uint8Array(cached!)).toEqual(binary);
    });

    it('skips downloading a server asset that already exists locally', async () => {
      jest.spyOn(authService, 'getToken').mockReturnValue('token');
      await store.write('level1', 'chunk', 'already.bin', new Uint8Array([5]).buffer);
      const id = await store.getMany({ where: [['levelId', '==', 'level1']] })
        .then(r => r.items[0].id);
      await store.markSynced(id, Date.now(), null);

      global.fetch = jest.fn()
        .mockResolvedValueOnce(mockResponse(200, [{ id: 'srv-1', levelId: 'level1', assetType: 'chunk', filename: 'already.bin', publicUrl: 'http://minio/already.bin' }]));

      await store.sync();

      // fetch called once (list) but not a second time (no download)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
