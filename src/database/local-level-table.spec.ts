import type { ILevel } from 'models';
import { LocalAssetStore } from './local-asset-store';
import { clearDatabase } from './local-db';
import { LocalLevelTable } from './local-level-table';
import { installOPFSMock } from './opfs-mock';

const FILES = [
  '0_0.bin',
  '0_0.biome.bin',
  '0_0.water.bin',
  'water-bodies.json',
];

const level = (overrides: Partial<ILevel> = {}): ILevel => ({
  name: 'Level',
  projectId: 'p1',
  activeOnStartup: false,
  hasTerrain: true,
  startEvent: '',
  containers: [],
  ...overrides,
});

describe('LocalLevelTable', () => {
  let levels: LocalLevelTable;
  let assets: LocalAssetStore;
  let id: string;

  const remaining = async () => {
    const left: string[] = [];
    for (const name of FILES)
      if (await assets.read(id, 'chunk', name)) left.push(name);
    return left;
  };

  beforeEach(async () => {
    await clearDatabase('rewild');
    installOPFSMock();
    levels = new LocalLevelTable();
    assets = new LocalAssetStore();
    id = (await levels.add(level())).id;
    for (const name of FILES)
      await assets.write(id, 'chunk', name, new Uint8Array([1]).buffer);
  });

  describe('markCleared', () => {
    it('makes the level dirty even when this clock is behind the server', async () => {
      await levels.markSynced(id, Date.now() + 60_000, null);
      await levels.markCleared(id);
      const dirty = await levels.getDirty();
      expect(dirty.map((l) => l.id)).toEqual([id]);
    });

    it('always moves the time forward', async () => {
      await levels.patch(id, { chunksClearedAt: Date.now() + 60_000 });
      const before = (await levels.getOne(id))!.chunksClearedAt!;
      await levels.markCleared(id);
      expect((await levels.getOne(id))!.chunksClearedAt).toBe(before + 1);
    });
  });

  describe('putSynced', () => {
    const pulled = async (overrides: Partial<ILevel>) => {
      const local = (await levels.getOne(id))!;
      await levels.putSynced(
        { ...local, ...overrides, updatedAt: Date.now() },
        Date.now()
      );
    };

    it('removes every chunk file, water included, for a newer clear', async () => {
      await pulled({ chunksClearedAt: 2000 });
      expect(await remaining()).toEqual([]);
      expect((await levels.getOne(id))!.chunksClearedAt).toBe(2000);
    });

    it('keeps the files for a clear this device already made', async () => {
      await levels.patch(id, { chunksClearedAt: 2000 });
      await pulled({ chunksClearedAt: 2000 });
      expect(await remaining()).toEqual(FILES);
    });
  });

  it('removes the files with a tombstone from another device', async () => {
    await levels.hardRemove(id);
    expect(await remaining()).toEqual([]);
  });

  it('removes the files when the level is deleted here', async () => {
    await levels.remove(id);
    expect(await remaining()).toEqual([]);
  });
});
