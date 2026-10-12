import { db } from './database';
import { installOPFSMock } from './opfs-mock';
import { clearDatabase } from './local-db';
import { authService } from '../api/auth/auth-service';
import { mockResponse } from '../test-utils';

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
    await db.assets.write(id, 'chunk', '0_0.bin', new Uint8Array([1]).buffer);

    await db.clearLevelChunks(id);

    expect(await db.assets.read(id, 'chunk', '0_0.bin')).toBeNull();
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
    await db.assets.write(levelId, 'chunk', '0_0.bin', new Uint8Array([1]).buffer);
  });

  afterEach(() => jest.restoreAllMocks());

  const isGone = async () =>
    !(await db.projects.getOne(projectId)) &&
    !(await db.levels.getOne(levelId)) &&
    !(await db.assets.read(levelId, 'chunk', '0_0.bin'));

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
    expect(await db.assets.read(levelId, 'chunk', '0_0.bin')).not.toBeNull();
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
