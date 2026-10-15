import { apiFetch, responseError } from '../auth/api-client';
import type { components } from '../../types/api';
import type { AssetRef } from '../../database/local-asset-store';

type UploadUrlRequest = components['schemas']['com.rewild.models.UploadUrlRequest'];
type UploadUrlResponse = components['schemas']['com.rewild.models.UploadUrlResponse'];
export type ServerAsset = components['schemas']['com.rewild.models.Asset'];

// Step 1 of upload: the server checks ownership and the file against its asset type's rule,
// and returns a presigned PUT URL. The PUT must send the requested Content-Type.
export async function requestUploadUrl(req: UploadUrlRequest): Promise<UploadUrlResponse> {
  const res = await apiFetch('/api/assets/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw await responseError(res, 'Could not upload the file');
  return res.json();
}

// Step 2 of upload: the server checks the uploaded object and makes it the file's new
// version. Resolves to the asset, whose updatedAt is that version.
export async function confirmUpload(storageKey: string): Promise<ServerAsset> {
  const res = await apiFetch('/api/assets/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storageKey }),
  });
  if (!res.ok) throw await responseError(res, 'Could not upload the file');
  return res.json();
}

// Returns all confirmed assets for the current user. Used during sync to
// find server-side assets the client hasn't cached locally yet.
export async function listServerAssets(): Promise<ServerAsset[]> {
  const res = await apiFetch('/api/assets');
  if (!res.ok) throw new Error(`list assets failed: ${res.status}`);
  return res.json();
}

export const PROJECT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_PROJECT_IMAGE_BYTES = 2 * 1024 * 1024;

/** The project image: one file on the project, which the server limits to these types and size. */
export function projectImageAsset(projectId: string): AssetRef {
  return { projectId, levelId: null, assetType: 'image', filename: 'image' };
}

/** Returns why the file cannot be a project image, or null when it can. */
export function projectImageProblem(file: File): string | null {
  if (!PROJECT_IMAGE_TYPES.includes(file.type))
    return 'The image must be a PNG, JPEG or WebP file';
  if (file.size > MAX_PROJECT_IMAGE_BYTES) return 'The image must be 2 MB or smaller';
  return null;
}
