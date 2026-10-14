import { apiFetch, responseError } from './auth/api-client';
import type { components } from '../types/api';

export type UserSummary = components['schemas']['com.rewild.models.UserSummary'];

/** Logged in only. Users whose display name starts with `query`, or whose email is exactly `query`. */
export async function searchUsers(query: string): Promise<UserSummary[]> {
  const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw await responseError(res, 'Could not search users');
  return res.json();
}
