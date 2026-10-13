import { apiFetch, responseError } from './auth/api-client';
import type { components } from '../types/api';

export type PublicGame = components['schemas']['com.rewild.models.PublicGame'];

/** The project promoted to Story Mode, or null when none is promoted. */
export async function getPublicGame(): Promise<PublicGame | null> {
  const res = await apiFetch('/api/public-game');
  if (res.status === 204) return null;
  if (!res.ok) throw await responseError(res, 'Could not load the public game');
  return res.json();
}

/** Super admin only. A null id clears the promotion. */
export async function setPublicGame(projectId: string | null): Promise<PublicGame | null> {
  const res = await apiFetch('/api/public-game', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
  if (res.status === 204) return null;
  if (!res.ok) throw await responseError(res, 'Could not set the public game');
  return res.json();
}
