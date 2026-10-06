import { apiFetch } from './auth/api-client';
import type { components } from '../types/api';

export type UserAccount = components['schemas']['com.rewild.admin.UserAccount'];
export type UpdateUserRequest =
  components['schemas']['com.rewild.admin.UpdateUserRequest'];

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
