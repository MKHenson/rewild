import 'rewild-ui/compiler/jsx';
import { db } from '../../database/database';
import { installOPFSMock } from '../../database/opfs-mock';
import { clearDatabase } from '../../database/local-db';
import { emptySceneGraph } from '../../test-utils';
import { LevelsStore } from './LevelsStore';
import { projectStore } from './ProjectStore';

describe('LevelsStore', () => {
  const projectId = 'p1';
  let store: LevelsStore;
  let startLevelId: string;

  const addLevel = async (name: string) =>
    (
      await db.levels.add({
        name,
        projectId,
        hasTerrain: true,
        startEvent: '',
        sceneGraph: emptySceneGraph(),
      })
    ).id;

  beforeEach(async () => {
    await clearDatabase('rewild');
    installOPFSMock();
    jest.spyOn(db, 'syncAll').mockResolvedValue();
    startLevelId = await addLevel('Start');
    projectStore.project = { id: projectId, levelId: startLevelId } as never;
    projectStore.level = null;
    projectStore.dirty = false;
    store = new LevelsStore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    projectStore.project = null;
  });

  it("lists the project's levels by name", async () => {
    await addLevel('Caves');
    await db.levels.add({ name: 'Elsewhere', projectId: 'p2', hasTerrain: true, startEvent: '', sceneGraph: emptySceneGraph() });

    await store.load(projectId);

    expect(store.levels.map((l) => l.name)).toEqual(['Caves', 'Start']);
  });

  it('adds a level with its own scene graph and syncs, without dirtying the project', async () => {
    await store.load(projectId);

    await store.add(projectId);

    const added = store.levels.find((l) => l.name === 'New Level')!;
    expect(added.projectId).toBe(projectId);
    expect(added.sceneGraph.containers).toEqual([]);
    expect(db.syncAll).toHaveBeenCalled();
    expect(projectStore.dirty).toBe(false);
  });

  it('renames a level and the copy open in the editor', async () => {
    await store.load(projectId);
    projectStore.level = { ...store.levels[0] };

    await store.rename(startLevelId, '  Meadow  ');

    expect((await db.levels.getOne(startLevelId))!.name).toBe('Meadow');
    expect(projectStore.level!.name).toBe('Meadow');
  });

  it('ignores a blank rename', async () => {
    await store.load(projectId);

    await store.rename(startLevelId, '   ');

    expect((await db.levels.getOne(startLevelId))!.name).toBe('Start');
  });

  it('removes a level that is not the start level', async () => {
    const caves = await addLevel('Caves');
    await store.load(projectId);

    await store.remove(caves);

    expect(store.levels.map((l) => l.id)).toEqual([startLevelId]);
    expect(await db.levels.getOne(caves)).toBeNull();
  });

  it('never removes the start level', async () => {
    await store.load(projectId);

    expect(store.canRemove(startLevelId)).toBe(false);
    await store.remove(startLevelId);

    expect(await db.levels.getOne(startLevelId)).not.toBeNull();
  });

  it('keeps the level and reports the error when the delete fails', async () => {
    const caves = await addLevel('Caves');
    await store.load(projectId);
    jest.spyOn(db, 'deleteLevel').mockRejectedValue(new Error('offline'));

    await store.remove(caves);

    expect(store.error).toBe('offline');
    expect(store.levels.map((l) => l.id)).toContain(caves);
  });
});
