import { ILevel } from 'models';
import { db } from '../database/database';

export async function getLevel(projectId: string) {
  const allLevels = await db.levels.getMany({
    where: [['project', '==', projectId]],
  });

  const levels = allLevels.items;

  if (levels.length === 0) throw new Error('No level found for this project');

  return levels.at(0)!;
}

export async function getLevels(projectId: string, page?: any) {
  const allLevels = await db.levels.getMany({
    where: [['project', '==', projectId]],
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
