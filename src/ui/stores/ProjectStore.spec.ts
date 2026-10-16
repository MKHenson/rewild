import 'rewild-ui/compiler/jsx';
import { db } from '../../database/database';
import { installOPFSMock } from '../../database/opfs-mock';
import { clearDatabase } from '../../database/local-db';
import { emptySceneGraph } from '../../test-utils';
import { ProjectStore } from './ProjectStore';
import { sceneGraphStore } from './SceneGraphStore';

describe('ProjectStore', () => {
  let store: ProjectStore;
  let projectId: string;
  let firstId: string;
  let secondId: string;

  const addLevel = async (name: string, seed: number) =>
    (
      await db.levels.add({
        name,
        projectId,
        hasTerrain: true,
        startEvent: '',
        sceneGraph: { ...emptySceneGraph(), terrain: { version: 1, seed } },
      })
    ).id;

  beforeEach(async () => {
    await clearDatabase('rewild');
    installOPFSMock();
    jest.spyOn(db, 'syncAll').mockResolvedValue();
    projectId = (await db.projects.add({ name: 'P', description: '', levelId: '' })).id;
    firstId = await addLevel('First', 1);
    secondId = await addLevel('Second', 2);
    await db.projects.patch(projectId, { levelId: firstId });
    store = new ProjectStore();
    await store.getProject(projectId);
  });

  afterEach(() => jest.restoreAllMocks());

  it('opens the start level clean', () => {
    expect(store.level!.id).toBe(firstId);
    expect(store.dirty).toBe(false);
  });

  it('loads another level and its scene graph', async () => {
    const completed = jest.fn();
    store.dispatcher.add((e) => e.kind === 'loading-completed' && completed(e.level.id));

    await store.loadLevel(secondId);

    expect(store.level!.id).toBe(secondId);
    expect(store.level!.sceneGraph.terrain!.seed).toBe(2);
    expect(store.levelRef).toEqual({ projectId, levelId: secondId });
    expect(store.dirty).toBe(false);
    expect(completed).toHaveBeenCalledWith(secondId);
  });

  it('saves unsaved changes to the open level before loading another', async () => {
    const sky = sceneGraphStore.findNodeById('SKY')!;
    sky.resource!.properties!.find((p) => p.type === 'cloudiness')!.value = 0.1;
    store.dirty = true;

    await store.loadLevel(secondId);

    const first = await db.levels.getOne(firstId);
    expect(first!.sceneGraph.atmosphere.cloudiness).toBe(0.1);
    expect(store.level!.id).toBe(secondId);
  });

  it('stays on the open level when the save fails', async () => {
    store.dirty = true;
    jest.spyOn(db.levels, 'patch').mockRejectedValue(new Error('disk full'));

    await store.loadLevel(secondId);

    expect(store.level!.id).toBe(firstId);
    expect(store.dirty).toBe(true);
  });

  it('sets the start level at once, without dirtying the level', async () => {
    await store.setStartLevel(secondId);

    expect(store.project!.levelId).toBe(secondId);
    expect((await db.projects.getOne(projectId))!.levelId).toBe(secondId);
    expect(store.dirty).toBe(false);
  });

  it('saves the project fields without touching the open level', async () => {
    store.dirty = true;
    store.project!.name = 'Renamed';
    const patchLevel = jest.spyOn(db.levels, 'patch');

    await store.saveProject();

    expect((await db.projects.getOne(projectId))!.name).toBe('Renamed');
    expect(patchLevel).not.toHaveBeenCalled();
    expect(store.dirty).toBe(true);
  });
});
