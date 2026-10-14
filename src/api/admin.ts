import { apiFetch } from './auth/api-client';
import type { components } from '../types/api';

export type UserAccount = components['schemas']['com.rewild.admin.UserAccount'];
export type UpdateUserRequest =
  components['schemas']['com.rewild.admin.UpdateUserRequest'];
export type AdminProject = components['schemas']['com.rewild.admin.AdminProject'];
export type AdminProjectPage = components['schemas']['com.rewild.admin.AdminProjectPage'];
export type AdminProjectSort = 'name' | 'author' | 'updated' | 'flagged';

export interface AdminProjectQuery {
  /** Zero-based. */
  page?: number;
  /** At most 100. */
  pageSize?: number;
  sort?: AdminProjectSort;
  order?: 'asc' | 'desc';
}

async function toError(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new Error(body?.error || `${fallback} (${res.status})`);
}

export async function getAdminUsers(): Promise<UserAccount[]> {
  const res = await apiFetch('/api/admin/users');
  if (!res.ok) throw await toError(res, 'Could not load users');
  return res.json();
}

export async function getAdminUser(id: string): Promise<UserAccount> {
  const res = await apiFetch(`/api/admin/users/${encodeURIComponent(id)}`);
  if (!res.ok) throw await toError(res, 'Could not load user');
  return res.json();
}

export async function updateAdminUser(
  id: string,
  req: UpdateUserRequest
): Promise<UserAccount> {
  const res = await apiFetch(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw await toError(res, 'Could not update user');
  return res.json();
}

export async function sendAdminPasswordReset(id: string): Promise<void> {
  const res = await apiFetch(
    `/api/admin/users/${encodeURIComponent(id)}/password-reset`,
    { method: 'POST' }
  );
  if (!res.ok) throw await toError(res, 'Could not send password reset');
}

export async function getAdminProjects(
  query: AdminProjectQuery = {}
): Promise<AdminProjectPage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  const search = params.toString();
  const res = await apiFetch(`/api/admin/projects${search ? `?${search}` : ''}`);
  if (!res.ok) throw await toError(res, 'Could not load projects');
  return res.json();
}

/** Blocks a project: only its owner and super admins can play it. */
export async function flagProject(id: string): Promise<void> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(id)}/flag`, {
    method: 'POST',
  });
  if (!res.ok) throw await toError(res, 'Could not flag the project');
}

export async function unflagProject(id: string): Promise<void> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(id)}/flag`, {
    method: 'DELETE',
  });
  if (!res.ok) throw await toError(res, 'Could not unflag the project');
}
