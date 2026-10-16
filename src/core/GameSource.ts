import { ILevel, IProject } from 'models';
import { getLevel } from '../api/levels';
import { getPlayProject } from '../api/play';
import { db, localAssetReader } from '../database/database';
import { AssetReader } from '../database/local-asset-store';
import { remoteAssetReader } from '../database/remote-assets';

/** What a game needs to start: the project, the level to play and readers for the project's level files. */
export interface GameSource {
  project: IProject;
  level: ILevel | null;
  /** The played level's files. */
  read: AssetReader | null;
  /** Any level's files in the project. */
  readLevel: (levelId: string) => AssetReader;
}

/**
 * Loads `levelId`, or the project's start level when it is omitted.
 * A project on this device loads from the local DB, which keeps unsynced edits and offline play.
 * Any other project loads from the play endpoint and stays in memory.
 */
export async function loadGameSource(projectId: string, levelId?: string): Promise<GameSource> {
  const local = await db.projects.getOne(projectId);
  if (local) {
    const id = levelId || local.levelId;
    const readLevel = (levelId: string) => localAssetReader({ projectId: local.id, levelId });
    const level = id ? await getLevel(id) : null;
    return { project: local, level, read: id ? readLevel(id) : null, readLevel };
  }

  const data = await getPlayProject(projectId);
  const project = data.project as unknown as IProject;
  const id = levelId || project.levelId;
  const level = data.levels.find((l) => l.id === id) ?? null;
  const readLevel = (levelId: string) => remoteAssetReader(data.assets.filter((a) => a.levelId === levelId));
  return {
    project,
    level: level as unknown as ILevel | null,
    read: level ? readLevel(level.id) : null,
    readLevel,
  };
}
