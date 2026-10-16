import { ILevel } from 'models';
import { db } from '../database/database';
import { apiFetch, responseError } from './auth/api-client';

export async function getLevel(id: string) {
  const level = await db.levels.getOne(id);

  if (!level) throw new Error('Level not found');

  return level;
}

/** Every level of the project, by name. */
export async function getLevels(projectId: string) {
  const allLevels = await db.levels.getMany({
    where: [['projectId', '==', projectId]],
    sort: [['name', 'asc']],
  });

  return allLevels.items;
}

export async function addLevel(token: Partial<ILevel>) {
  return await db.levels.add(token as ILevel);
}

export async function patchLevel(id: string, token: Partial<ILevel>) {
  await db.levels.patch(id, token as ILevel);
}

/** Deletes a level saved on the server. One the server no longer has counts as deleted. */
export async function deleteServerLevel(id: string): Promise<void> {
  const res = await apiFetch(`/api/levels/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (res.ok || res.status === 404) return;

  throw await responseError(res, 'Could not delete the level');
}
