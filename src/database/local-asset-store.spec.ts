import { AssetRef, LocalAssetStore } from './local-asset-store';
import { authService } from '../api/auth/auth-service';
import { installOPFSMock, MockDirectoryHandle } from './opfs-mock';
import { mockResponse, mockFetch } from '../test-utils';
import { clearDatabase } from './local-db';

const ref = (levelId: string) => ({ projectId: 'p1', levelId });
const chunk = (filename: string): AssetRef => ({ ...ref('level1'), assetType: 'chunk', filename });
const image = (projectId: string): AssetRef => ({ projectId, levelId: null, assetType: 'image', filename: 'image' });

const bytes = (file: Blob) =>
  new Promise<Uint8Array>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(file);
  });

describe('LocalAssetStore', () => {
  let store: LocalAssetStore;
  let root: MockDirectoryHandle;

  beforeEach(async () => {
    await clearDatabase('rewild');
    localStorage.clear();
    root = installOPFSMock();
    store = new LocalAssetStore();
  });

  describe('read / write', () => {
    it('writes and reads back binary data', async () => {
      const data = new Uint8Array([1, 2, 3, 4]).buffer;
      await store.write({ ...ref('level1'), assetType: 'chunk', filename: '32_16.bin' }, data);

      const result = await store.read({ ...ref('level1'), assetType: 'chunk', filename: '32_16.bin' });
      expect(result).not.toBeNull();
      expect(new Uint8Array(result!)).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('returns null for an asset that has never been written', async () => {
      const result = await store.read({ ...ref('level1'), assetType: 'chunk', filename: 'missing.bin' });
      expect(result).toBeNull();
    });

    it('overwrites binary data on a second write to the same path', async () => {
      await store.write({ ...ref('level1'), assetType: 'chunk', filename: 'overwrite.bin' }, new Uint8Array([1, 2]).buffer);
      await store.write({ ...ref('level1'), assetType: 'chunk', filename: 'overwrite.bin' }, new Uint8Array([9, 8, 7]).buffer);

      const result = await store.read({ ...ref('level1'), assetType: 'chunk', filename: 'overwrite.bin' });
      expect(new Uint8Array(result!)).toEqual(new Uint8Array([9, 8, 7]));
    });
  });

  describe('project files', () => {
    it('keeps a project file under the project, with its content type', async () => {
      await store.write(image('p1'), new Blob([new Uint8Array([1, 2])], { type: 'image/webp' }));

      const projects = await root.getDirectoryHandle('projects');
      const dir = await (await projects.getDirectoryHandle('p1')).getDirectoryHandle('image');
      await expect(dir.getFileHandle('image')).resolves.toBeDefined();
      const blob = await store.readBlob(image('p1'));
      expect(blob!.type).toBe('image/webp');
      expect(await bytes(blob!)).toEqual(new Uint8Array([1, 2]));
    });

    it('a level file defaults to binary', async () => {
      await store.write(chunk('a.bin'), new Uint8Array([1]).buffer);

      expect((await store.readBlob(chunk('a.bin')))!.type).toBe('application/octet-stream');
    });
  });

  describe('layout', () => {
    it('keeps level files under their project, like the bucket', async () => {
      await store.write({ ...ref('level1'), assetType: 'chunk', filename: '0_0.bin' }, new Uint8Array([1]).buffer);

      const projects = await root.getDirectoryHandle('projects');
      const levels = await (await projects.getDirectoryHandle('p1')).getDirectoryHandle('levels');
      const chunk = await (await levels.getDirectoryHandle('level1')).getDirectoryHandle('chunk');
      await expect(chunk.getFileHandle('0_0.bin')).resolves.toBeDefined();
    });

    it('keeps the same file name apart in two projects', async () => {
      await store.write({ projectId: 'p1', levelId: 'l', assetType: 'chunk', filename: 'a.bin' }, new Uint8Array([1]).buffer);
      await store.write({ projectId: 'p2', levelId: 'l', assetType: 'chunk', filename: 'a.bin' }, new Uint8Array([2]).buffer);

      const second = await store.read({ projectId: 'p2', levelId: 'l', assetType: 'chunk', filename: 'a.bin' });
      expect(new Uint8Array(second!)).toEqual(new Uint8Array([2]));
    });
  });

  describe('removeByProject', () => {
    it("removes the project's level files, image and records, and nothing else", async () => {
      await store.write({ ...ref('level1'), assetType: 'chunk', filename: 'a.bin' }, new Uint8Array([1]).buffer);
      await store.write(image('p1'), new Blob([new Uint8Array([1])], { type: 'image/png' }));
      await store.write({ projectId: 'p2', levelId: 'other', assetType: 'chunk', filename: 'b.bin' }, new Uint8Array([2]).buffer);

      await store.removeByProject('p1');

      expect(await store.read({ ...ref('level1'), assetType: 'chunk', filename: 'a.bin' })).toBeNull();
      expect(await store.readBlob(image('p1'))).toBeNull();
      expect((await store.getDirty()).map((d) => d.projectId)).toEqual(['p2']);
    });
  });

  describe('dirty detection', () => {
    it('a newly written asset has syncedAt=0 and is dirty', async () => {
      await store.write({ ...ref('level1'), assetType: 'chunk', filename: 'terrain.bin' }, new Uint8Array([5, 6]).buffer);

      const dirty = await store.getDirty();
      expect(dirty.length).toBe(1);
      expect(dirty[0].syncedAt).toBe(0);
      expect(dirty[0].levelId).toBe('level1');
    });

    it('re-writing a synced asset marks it dirty again', async () => {
      const id = await store.write({ ...ref('level1'), assetType: 'chunk', filename: 'a.bin' }, new Uint8Array([1]).buffer);

      // Mark synced at the same timestamp as updatedAt so the record is clean
      const record = await store.getOne(id);
      await store.markSynced(id, record!.updatedAt, null);
      expect(await store.getDirty()).toHaveLength(0);

      // Wait briefly so Date.now() advances past syncedAt, then re-write
      await new Promise((r) => setTimeout(r, 5));
      await store.write({ ...ref('level1'), assetType: 'chunk', filename: 'a.bin' }, new Uint8Array([2]).buffer);

      const dirty = await store.getDirty();
      expect(dirty.map((d) => d.id)).toContain(id);
    });

    it('a second write to the same path does not create a duplicate metadata record', async () => {
      await store.write({ ...ref('level1'), assetType: 'chunk', filename: 'dup.bin' }, new Uint8Array([1]).buffer);
      await store.write({ ...ref('level1'), assetType: 'chunk', filename: 'dup.bin' }, new Uint8Array([2]).buffer);

      const dirty = await store.getDirty();
      const matches = dirty.filter((d) => d.levelId === 'level1' && d.filename === 'dup.bin');
      expect(matches).toHaveLength(1);
    });
  });

  describe('removeByLevel', () => {
    it('removes OPFS binary files for the deleted level', async () => {
      await store.write({ ...ref('level-del'), assetType: 'chunk', filename: 'x.bin' }, new Uint8Array([9]).buffer);
      await store.removeByLevel('level-del');

      expect(await store.read({ ...ref('level-del'), assetType: 'chunk', filename: 'x.bin' })).toBeNull();
    });

    it('removes metadata records for the deleted level', async () => {
      await store.write({ ...ref('level-del'), assetType: 'chunk', filename: 'x.bin' }, new Uint8Array([9]).buffer);
      await store.write({ ...ref('level-del'), assetType: 'chunk', filename: 'y.bin' }, new Uint8Array([8]).buffer);
      await store.removeByLevel('level-del');

      const dirty = await store.getDirty();
      expect(dirty.every((d) => d.levelId !== 'level-del')).toBe(true);
    });

    it('does not affect assets belonging to other levels', async () => {
      await store.write({ ...ref('level-del'), assetType: 'chunk', filename: 'x.bin' }, new Uint8Array([9]).buffer);
      await store.write({ ...ref('level-keep'), assetType: 'chunk', filename: 'z.bin' }, new Uint8Array([7]).buffer);

      await store.removeByLevel('level-del');

      const kept = await store.read({ ...ref('level-keep'), assetType: 'chunk', filename: 'z.bin' });
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
    const serverAsset = (asset: AssetRef, updatedAt: number, contentType = 'application/octet-stream') => ({
      id: `srv-${asset.filename}`,
      ...asset,
      contentType,
      publicUrl: `http://minio/${asset.filename}?v=${updatedAt}`,
      updatedAt,
    });
    const uploadUrl = () => mockResponse(200, { uploadUrl: 'http://minio/presigned', publicUrl: '', storageKey: 'key' });
    const download = (data: number[]) =>
      ({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new Uint8Array(data).buffer) }) as unknown as Response;

    beforeEach(() => {
      jest.spyOn(authService, 'getToken').mockReturnValue('token');
      jest.spyOn(authService, 'refreshToken').mockResolvedValue(null);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('is a no-op when not authenticated', async () => {
      (authService.getToken as jest.Mock).mockReturnValue(null);
      await store.write(chunk('a.bin'), new Uint8Array([1]).buffer);
      global.fetch = jest.fn();

      await store.sync();

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('uploads every pending file the same way and records the version', async () => {
      await store.write(chunk('a.bin'), new Uint8Array([1, 2, 3]).buffer);
      await store.write(image('p1'), new Blob([new Uint8Array([4])], { type: 'image/png' }));
      const uploads: Record<string, { request: unknown; put?: RequestInit }> = {};
      const confirmed = [serverAsset(chunk('a.bin'), 11), serverAsset(image('p1'), 12, 'image/png')];
      global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/assets/upload-url')) {
          const request = JSON.parse(init!.body as string);
          uploads[request.filename] = { request };
          return mockResponse(200, { uploadUrl: `http://minio/${request.filename}`, storageKey: request.filename });
        }
        if (url.startsWith('http://minio/')) {
          uploads[url.slice('http://minio/'.length)].put = init;
          return mockResponse(200);
        }
        if (url.endsWith('/api/assets/confirm')) {
          const { storageKey } = JSON.parse(init!.body as string);
          return mockResponse(200, confirmed.find((a) => a.filename === storageKey));
        }
        return mockResponse(200, confirmed);
      }) as never;

      await store.sync();

      expect(uploads['a.bin'].request).toEqual({ ...chunk('a.bin'), contentType: 'application/octet-stream', size: 3 });
      expect(uploads['a.bin'].put!.headers).toEqual({ 'Content-Type': 'application/octet-stream' });
      expect(uploads['image'].request).toEqual({ ...image('p1'), contentType: 'image/png', size: 1 });
      expect(uploads['image'].put!.headers).toEqual({ 'Content-Type': 'image/png' });
      expect(global.fetch).toHaveBeenCalledTimes(7);
      expect(await store.getDirty()).toHaveLength(0);
      expect(await store.readBlob(image('p1'))).not.toBeNull();
    });

    it('a write during the upload stays pending', async () => {
      await store.write(chunk('a.bin'), new Uint8Array([1]).buffer);
      mockFetch(uploadUrl(), mockResponse(200), mockResponse(200, serverAsset(chunk('a.bin'), 11)), mockResponse(200, []));
      const realFetch = global.fetch as jest.Mock;
      global.fetch = jest.fn(async (...args) => {
        const res = await realFetch(...args);
        if (realFetch.mock.calls.length === 2) {
          await new Promise((r) => setTimeout(r, 2));
          await store.write(chunk('a.bin'), new Uint8Array([2]).buffer);
        }
        return res;
      }) as never;

      await store.sync();

      expect(await store.isPending(chunk('a.bin'))).toBe(true);
    });

    it('sets syncError on a pending file when the upload fails', async () => {
      const id = await store.write(chunk('b.bin'), new Uint8Array([9]).buffer);
      mockFetch(uploadUrl(), mockResponse(503), mockResponse(200, []));

      await store.sync();

      const record = await store.getOne(id);
      expect(record!.syncError).toMatch(/503/);
      expect(record!.syncedAt).toBe(0);
    });

    it('downloads a server file this device lacks and keeps it as synced', async () => {
      const remote = { ...ref('level-remote'), assetType: 'chunk', filename: 'remote.bin' };
      mockFetch(mockResponse(200, [serverAsset(remote, 5)]), download([7, 8, 9]));

      await store.sync();

      expect(String((global.fetch as jest.Mock).mock.calls[1][0])).toBe('http://minio/remote.bin?v=5');
      expect(new Uint8Array((await store.read(remote))!)).toEqual(new Uint8Array([7, 8, 9]));
      expect(await store.isPending(remote)).toBe(false);
    });

    it('skips a file whose version this device has', async () => {
      mockFetch(mockResponse(200, [serverAsset(chunk('a.bin'), 5)]), download([1]), mockResponse(200, [serverAsset(chunk('a.bin'), 5)]));
      await store.sync();

      await store.sync();

      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('downloads a newer version from another device', async () => {
      mockFetch(
        mockResponse(200, [serverAsset(image('p1'), 5, 'image/png')]),
        download([1]),
        mockResponse(200, [serverAsset(image('p1'), 6, 'image/jpeg')]),
        download([2])
      );
      await store.sync();

      await store.sync();

      const blob = await store.readBlob(image('p1'));
      expect(blob!.type).toBe('image/jpeg');
      expect(await bytes(blob!)).toEqual(new Uint8Array([2]));
    });

    it('never replaces a file with changes this device has not uploaded', async () => {
      await store.write(chunk('a.bin'), new Uint8Array([1]).buffer);
      mockFetch(mockResponse(500, { error: 'Nope' }), mockResponse(200, [serverAsset(chunk('a.bin'), 9)]));

      await store.sync();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(new Uint8Array((await store.read(chunk('a.bin')))!)).toEqual(new Uint8Array([1]));
      expect(await store.isPending(chunk('a.bin'))).toBe(true);
    });
  });
});
