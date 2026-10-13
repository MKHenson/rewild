import { ILevel, IProject } from 'models';
import { getLevel } from '../api/levels';
import { getPlayProject } from '../api/play';
import { db, localAssetReader } from '../database/database';
import { AssetReader, startLevelRef } from '../database/local-asset-store';
import { remoteAssetReader } from '../database/remote-assets';

/** What a game needs to start: the project, its start level and a reader for that level's files. */
export interface GameSource {
  project: IProject;
  level: ILevel | null;
  read: AssetReader | null;
}

/**
 * A project on this device loads from the local DB, which keeps unsynced edits and offline play.
 * Any other project loads from the play endpoint and stays in memory.
 */
export async function loadGameSource(projectId: string): Promise<GameSource> {
  const local = await db.projects.getOne(projectId);
  if (local) {
    const level = local.levelId ? await getLevel(local.levelId) : null;
    const ref = startLevelRef(local);
    return { project: local, level, read: ref ? localAssetReader(ref) : null };
  }

  const data = await getPlayProject(projectId);
  const project = data.project as unknown as IProject;
  const level = data.levels.find((l) => l.id === project.levelId) ?? null;
  return {
    project,
    level: level as unknown as ILevel | null,
    read: level
      ? remoteAssetReader(data.assets.filter((a) => a.levelId === level.id))
      : null,
  };
}
