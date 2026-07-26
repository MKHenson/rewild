import { ILevel } from 'models';
import { db } from '../database/database';

/** The project's level, or null when it has none yet. */
export async function findLevel(projectId: string) {
  const allLevels = await db.levels.getMany({
    where: [['projectId', '==', projectId]],
  });

  return allLevels.items.at(0) ?? null;
}

export async function getLevel(projectId: string) {
  const level = await findLevel(projectId);

  if (!level) throw new Error('No level found for this project');

  return level;
}

export async function getLevels(projectId: string, page?: any) {
  const allLevels = await db.levels.getMany({
    where: [['projectId', '==', projectId]],
    cursor: page,
    limit: 30,
    sort: [['created', 'desc']],
  });

  return allLevels.items;
}

export async function addLevel(token: Partial<ILevel>) {
  return await db.levels.add(token as ILevel);
}

export async function deleteLevel(id: string) {
  await db.levels.remove(id);
}

export async function patchLevel(id: string, token: Partial<ILevel>) {
  await db.levels.patch(id, token as ILevel);
}
