import { ILevel } from 'models';
import { db } from '../database/database';

export async function getLevel(id: string) {
  const level = await db.levels.getOne(id);

  if (!level) throw new Error('Level not found');

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
