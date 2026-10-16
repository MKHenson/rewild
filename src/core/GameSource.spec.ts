import { ILevel, IProject } from 'models';
import { loadGameSource } from './GameSource';
import { GameBlockedError, GameNotFoundError } from '../api/play';
import { authService } from '../api/auth/auth-service';
import { db } from '../database/database';
import { installOPFSMock } from '../database/opfs-mock';
import { clearDatabase } from '../database/local-db';
import { emptySceneGraph } from '../test-utils';

const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  arrayBuffer: async () => new Uint8Array([9]).buffer,
});

const remoteProject = {
  id: 'remote-p',
  levelId: 'remote-l',
  name: 'Remote',
  description: '',
  updatedAt: 1,
};

const playResponse = {
  project: remoteProject,
  levels: [
    { id: 'remote-l', projectId: 'remote-p', name: 'Start', hasTerrain: true, startEvent: '', sceneGraph: emptySceneGraph(), updatedAt: 1 },
    { id: 'other-l', projectId: 'remote-p', name: 'Other', hasTerrain: true, startEvent: '', sceneGraph: emptySceneGraph(), updatedAt: 1 },
  ],
  assets: [
    { id: 'a1', projectId: 'remote-p', levelId: 'remote-l', assetType: 'chunk', filename: '0_0.bin', publicUrl: 'https://cdn/start/0_0.bin?v=1', updatedAt: 1 },
    { id: 'a2', projectId: 'remote-p', levelId: 'other-l', assetType: 'chunk', filename: '1_0.bin', publicUrl: 'https://cdn/other/1_0.bin?v=1', updatedAt: 1 },
  ],
};

describe('loadGameSource', () => {
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    await clearDatabase('rewild');
    localStorage.clear();
    installOPFSMock();
    jest.spyOn(authService, 'getToken').mockReturnValue(null);
    fetchMock = jest.fn(async (url: string) =>
      url.includes('/api/play/remote-p')
        ? json(playResponse)
        : url.includes('/api/play/blocked-p')
          ? json({ error: 'Contact an admin' }, 403)
          : url.includes('/api/play/')
            ? json({ error: 'Not found' }, 404)
            : json(null)
    );
    global.fetch = fetchMock as never;
  });

  afterEach(() => jest.restoreAllMocks());

  it('loads a project on this device from the local DB, without a request', async () => {
    const project = await db.projects.add({ name: 'Mine', description: '', } as unknown as IProject);
    const level = await db.levels.add({ name: 'Start', projectId: project.id, hasTerrain: true, startEvent: '', sceneGraph: emptySceneGraph() } as ILevel);
    await db.projects.patch(project.id, { levelId: level.id } as IProject);
    await db.assets.write({ projectId: project.id, levelId: level.id, assetType: 'chunk', filename: '0_0.bin' }, new Uint8Array([4]).buffer);

    const source = await loadGameSource(project.id);

    expect(source.project.name).toBe('Mine');
    expect(source.level?.id).toBe(level.id);
    expect(new Uint8Array((await source.read!('chunk', '0_0.bin'))!)).toEqual(new Uint8Array([4]));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads any other project from the play endpoint and keeps it off the device', async () => {
    const source = await loadGameSource('remote-p');

    expect(source.project.id).toBe('remote-p');
    expect(source.level?.id).toBe('remote-l');
    expect(await source.read!('chunk', '0_0.bin')).not.toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith('https://cdn/start/0_0.bin?v=1');
    expect(await source.read!('chunk', '1_0.bin')).toBeNull();
    expect(await db.projects.getOne('remote-p')).toBeFalsy();
  });

  it('loads the given level of a remote project and reads any level', async () => {
    const source = await loadGameSource('remote-p', 'other-l');

    expect(source.level?.id).toBe('other-l');
    expect(await source.read!('chunk', '1_0.bin')).not.toBeNull();
    expect(await source.readLevel('remote-l')('chunk', '0_0.bin')).not.toBeNull();
    expect(await source.readLevel('remote-l')('chunk', '1_0.bin')).toBeNull();
  });

  it('loads the given level of a local project and reads any level', async () => {
    const project = await db.projects.add({ name: 'Mine', description: '' } as unknown as IProject);
    const start = await db.levels.add({ name: 'Start', projectId: project.id, hasTerrain: true, startEvent: '', sceneGraph: emptySceneGraph() } as ILevel);
    const past = await db.levels.add({ name: 'Past', projectId: project.id, hasTerrain: true, startEvent: '', sceneGraph: emptySceneGraph() } as ILevel);
    await db.projects.patch(project.id, { levelId: start.id } as IProject);
    await db.assets.write({ projectId: project.id, levelId: start.id, assetType: 'portal-view', filename: 'view' }, new Uint8Array([7]).buffer);

    const source = await loadGameSource(project.id, past.id);

    expect(source.level?.id).toBe(past.id);
    expect(new Uint8Array((await source.readLevel(start.id)('portal-view', 'view'))!)).toEqual(new Uint8Array([7]));
    expect(await source.read!('portal-view', 'view')).toBeNull();
  });

  it('throws GameBlockedError with the server message for a flagged project', async () => {
    const error = await loadGameSource('blocked-p').catch((e) => e);
    expect(error).toBeInstanceOf(GameBlockedError);
    expect(error.message).toBe('Contact an admin');
  });

  it('throws GameNotFoundError when the server does not let the player load it', async () => {
    await expect(loadGameSource('hidden-p')).rejects.toBeInstanceOf(GameNotFoundError);
  });
});
