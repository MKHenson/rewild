import { db } from '../database/database';
import { apiFetch, responseError } from './auth/api-client';
import { IProject } from 'models';

export async function getProjects(cursor?: any) {
  const resp = await db.projects.getMany({
    limit: 30,
    cursor,
    sort: [['updatedAt', 'desc']],
  });

  return resp.items;
}

export async function getProject(id: string) {
  const project = await db.projects.getOne(id);
  return project;
}

export async function addProject(token: Partial<IProject>) {
  const resp = await db.projects.add(token as IProject);
  return resp;
}

export async function patchProject(id: string, token: Partial<IProject>) {
  await db.projects.patch(id, token as IProject);
}

/** Deletes a project saved on the server. One the server no longer has counts as deleted. */
export async function deleteServerProject(id: string): Promise<void> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (res.ok || res.status === 404) return;

  throw await responseError(res, 'Could not delete the project');
}
