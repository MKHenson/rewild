import { projectImageAsset } from '../api/assets/asset-api';
import { db } from './database';
import { installOPFSMock } from './opfs-mock';
import { clearDatabase } from './local-db';
import { authService } from '../api/auth/auth-service';
import { mockFetch, mockResponse } from '../test-utils';

const user = {
  displayName: 'Test',
  email: 'test@example.com',
  photoURL: null,
  emailVerified: false,
  role: 'user' as const,
};

describe('Database sync-on-login', () => {
  let syncSpy: jest.SpyInstance;

  beforeEach(() => {
    syncSpy = jest.spyOn(db, 'syncAll').mockResolvedValue();
  });

  afterEach(() => {
    syncSpy.mockRestore();
  });

  it('runs syncAll when a user authenticates (login/register/refresh)', () => {
    authService.onAuthStateChanged.dispatch(user);
    expect(syncSpy).toHaveBeenCalledTimes(1);
  });

  it('does not sync on sign-out', () => {
    authService.onAuthStateChanged.dispatch(null);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it('a failing post-login sync warns instead of throwing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    syncSpy.mockRejectedValue(new Error('offline'));

    authService.onAuthStateChanged.dispatch(user);
    await Promise.resolve(); // let the rejection propagate to the catch

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('Database clears', () => {
  beforeEach(async () => {
    await clearDatabase('rewild');
    installOPFSMock();
  });

  it('removes the chunk files and marks the level for sync', async () => {
    const { id } = await db.levels.add({
      name: 'Level',
      projectId: 'p1',
      hasTerrain: true,
      startEvent: '',
      containers: [],
    });
    await db.levels.markSynced(id, Date.now(), null);
    await db.assets.write({ projectId: 'p1', levelId: id, assetType: 'chunk', filename: '0_0.bin' }, new Uint8Array([1]).buffer);

    await db.clearLevelChunks(id);

    expect(await db.assets.read({ projectId: 'p1', levelId: id, assetType: 'chunk', filename: '0_0.bin' })).toBeNull();
    expect((await db.levels.getOne(id))!.chunksClearedAt).toBeGreaterThan(0);
    expect((await db.levels.getDirty()).map((l) => l.id)).toEqual([id]);
  });
});

describe('Database.deleteProject', () => {
  let projectId: string;
  let levelId: string;

  beforeEach(async () => {
    await clearDatabase('rewild');
    installOPFSMock();
    global.fetch = jest.fn().mockResolvedValue(mockResponse(204));
    projectId = (await db.projects.add({ name: 'Doomed' } as any)).id;
    levelId = (
      await db.levels.add({
        name: 'Level',
        projectId,
        hasTerrain: true,
        startEvent: '',
        containers: [],
      })
    ).id;
    await db.assets.write({ projectId, levelId, assetType: 'chunk', filename: '0_0.bin' }, new Uint8Array([1]).buffer);
  });

  afterEach(() => jest.restoreAllMocks());

  const isGone = async () =>
    !(await db.projects.getOne(projectId)) &&
    !(await db.levels.getOne(levelId)) &&
    !(await db.assets.read({ projectId, levelId, assetType: 'chunk', filename: '0_0.bin' }));

  it('deletes a local only project on the device', async () => {
    await db.deleteProject(projectId);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(await isGone()).toBe(true);
    expect(await db.projects.getDirty()).toEqual([]);
  });

  it('deletes a saved project on the server first', async () => {
    await db.projects.markSynced(projectId, Date.now(), null);

    await db.deleteProject(projectId);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toContain(`/api/projects/${projectId}`);
    expect(init.method).toBe('DELETE');
    expect(await isGone()).toBe(true);
  });

  it('keeps the local copy when the server delete fails', async () => {
    await db.projects.markSynced(projectId, Date.now(), null);
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(500, { error: 'Nope' }));

    await expect(db.deleteProject(projectId)).rejects.toThrow('Nope');
    expect(await db.projects.getOne(projectId)).not.toBeNull();
    expect(await db.assets.read({ projectId, levelId, assetType: 'chunk', filename: '0_0.bin' })).not.toBeNull();
  });

  it('treats a project the server no longer has as deleted', async () => {
    await db.projects.markSynced(projectId, Date.now(), null);
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(404));

    await db.deleteProject(projectId);

    expect(await isGone()).toBe(true);
  });
});

describe('Database.syncAll', () => {
  afterEach(() => jest.restoreAllMocks());

  it('skips the asset sync when the record sync does not reach the server', async () => {
    jest.spyOn(db.sync, 'run').mockResolvedValue(false);
    const assets = jest.spyOn(db.assets, 'sync').mockResolvedValue();
    await db.syncAll();
    expect(assets).not.toHaveBeenCalled();
  });

  it('runs the asset sync after the record sync', async () => {
    jest.spyOn(db.sync, 'run').mockResolvedValue(true);
    const assets = jest.spyOn(db.assets, 'sync').mockResolvedValue();
    await db.syncAll();
    expect(assets).toHaveBeenCalledTimes(1);
  });

  it('holds a clear until a running sync ends', async () => {
    const order: string[] = [];
    let finish: (ok: boolean) => void = () => undefined;
    jest.spyOn(db.sync, 'run').mockImplementation(
      () => new Promise<boolean>((resolve) => (finish = resolve))
    );
    jest.spyOn(db.assets, 'sync').mockImplementation(async () => {
      order.push('pull');
    });
    jest.spyOn(db.assets, 'removeChunksByLevel').mockImplementation(async () => {
      order.push('clear');
    });
    jest.spyOn(db.levels, 'markCleared').mockResolvedValue();

    const sync = db.syncAll();
    const clear = db.clearLevelChunks('l1');
    await Promise.resolve();
    finish(true);
    await Promise.all([sync, clear]);
    expect(order).toEqual(['pull', 'clear']);
  });
});

describe('Database project images', () => {
  let projectId: string;

  beforeEach(async () => {
    await clearDatabase('rewild');
    installOPFSMock();
    jest.spyOn(db.sync, 'run').mockResolvedValue(true);
    jest.spyOn(authService, 'getToken').mockReturnValue('token');
    projectId = (await db.projects.add({ name: 'Pictured' } as any)).id;
  });

  afterEach(() => jest.restoreAllMocks());

  const png = () => new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' });

  const image = () => projectImageAsset(projectId);
  const setImage = (file: File) => db.writeAsset({ ...image(), contentType: file.type }, file);

  it('keeps a picked image on the device with its type', async () => {
    await setImage(png());

    const local = await db.getProjectImage({ id: projectId });
    expect(local!.type).toBe('image/png');
    expect(local!.size).toBe(3);
    expect(await db.assets.isPending(image())).toBe(true);
  });

  it('a new pick replaces the image', async () => {
    await setImage(png());
    await setImage(new File([new Uint8Array([9])], 'c.webp', { type: 'image/webp' }));

    expect((await db.getProjectImage({ id: projectId }))!.type).toBe('image/webp');
  });

  it('syncs the image like any other asset and keeps the local file', async () => {
    await db.projects.markSynced(projectId, Date.now(), null);
    await setImage(png());
    const serverImage = {
      id: 'srv',
      ...image(),
      contentType: 'image/png',
      publicUrl: 'https://cdn/image?v=5',
      updatedAt: 5,
    };
    mockFetch(
      mockResponse(200, { uploadUrl: 'https://bucket/put', storageKey: 'k', publicUrl: '' }),
      mockResponse(200),
      mockResponse(200, serverImage),
      mockResponse(200, [serverImage])
    );

    await db.syncAll();

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(JSON.parse(calls[0][1].body)).toEqual({
      projectId,
      levelId: null,
      assetType: 'image',
      filename: 'image',
      contentType: 'image/png',
      size: 3,
    });
    expect(calls[1][1].headers).toEqual({ 'Content-Type': 'image/png' });
    expect(calls).toHaveLength(4);
    expect(await db.assets.isPending(image())).toBe(false);
    expect(await db.getProjectImage({ id: projectId })).not.toBeNull();
  });

  it('keeps the local file when the upload fails', async () => {
    await db.projects.markSynced(projectId, Date.now(), null);
    await setImage(png());
    mockFetch(mockResponse(400, { error: 'Nope' }), mockResponse(200, []));

    await db.syncAll();

    expect(await db.getProjectImage({ id: projectId })).not.toBeNull();
    expect((await db.assets.getDirty())[0].syncError).toBe('Nope');
  });

  describe('getProjectImage', () => {
    const imageUrl = 'https://cdn/users/u/projects/p/image/image?v=5';
    const blobResponse = () =>
      ({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(new Blob([new Uint8Array([7])], { type: 'image/png' })),
      }) as unknown as Response;

    it('prefers the copy on this device over the URL', async () => {
      await setImage(png());
      global.fetch = jest.fn();

      const local = await db.getProjectImage({ id: projectId, imageUrl });

      expect(local!.size).toBe(3);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('downloads the image when the device has no copy, without storing it', async () => {
      mockFetch(blobResponse(), blobResponse());

      expect((await db.getProjectImage({ id: projectId, imageUrl }))!.size).toBe(1);
      await db.getProjectImage({ id: projectId, imageUrl });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(await db.assets.readBlob(image())).toBeNull();
    });

    it('resolves null when the download fails', async () => {
      mockFetch(mockResponse(404));
      expect(await db.getProjectImage({ id: projectId, imageUrl })).toBeNull();

      global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
      expect(await db.getProjectImage({ id: projectId, imageUrl })).toBeNull();
    });
  });

  it('a project delete removes its image', async () => {
    await setImage(png());

    await db.deleteProject(projectId);

    expect(await db.getProjectImage({ id: projectId })).toBeNull();
  });
});
