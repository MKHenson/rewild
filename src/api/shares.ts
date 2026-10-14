import { apiFetch, responseError } from './auth/api-client';
import type { components } from '../types/api';

export type ProjectShare = components['schemas']['com.rewild.models.ProjectShare'];
export type SharedProject = components['schemas']['com.rewild.models.Project'];

const sharesUrl = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/shares`;

/** Owner only. The users the project is shared with, newest first. */
export async function getShares(projectId: string): Promise<ProjectShare[]> {
  const res = await apiFetch(sharesUrl(projectId));
  if (!res.ok) throw await responseError(res, 'Could not load the shares');
  return res.json();
}

/** Owner only. Gives a user play access. Sharing with a user twice returns the existing share. */
export async function addShare(projectId: string, userId: string): Promise<ProjectShare> {
  const res = await apiFetch(sharesUrl(projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw await responseError(res, 'Could not share the project');
  return res.json();
}

/** Owner only. A share that is already gone counts as revoked. */
export async function revokeShare(projectId: string, userId: string): Promise<void> {
  const res = await apiFetch(`${sharesUrl(projectId)}/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  if (res.ok || res.status === 404) return;
  throw await responseError(res, 'Could not revoke the share');
}

/** Projects other users shared with the caller, newest first. */
export async function getSharedProjects(): Promise<SharedProject[]> {
  const res = await apiFetch('/api/projects?scope=shared');
  if (!res.ok) throw await responseError(res, 'Could not load the shared games');
  return res.json();
}
