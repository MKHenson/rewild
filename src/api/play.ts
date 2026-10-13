import { apiFetch, responseError } from './auth/api-client';
import type { components } from '../types/api';

export type PlayProject = components['schemas']['com.rewild.models.PlayProject'];

/** The project does not exist, or the player may not play it. */
export class GameNotFoundError extends Error {
  constructor() {
    super('This game could not be found. It may have been removed, or you do not have access to it.');
    this.name = 'GameNotFoundError';
  }
}

/** Loads a project that is not on this device, with its levels and their files. */
export async function getPlayProject(projectId: string): Promise<PlayProject> {
  const res = await apiFetch(`/api/play/${encodeURIComponent(projectId)}`);
  if (res.status === 404) throw new GameNotFoundError();
  if (!res.ok) throw await responseError(res, 'Could not load the game');
  return res.json();
}
