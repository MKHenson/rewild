import { apiFetch, responseError } from '../auth/api-client';
import type { components } from '../../types/api';

type UploadUrlResponse =
  components['schemas']['com.rewild.models.UploadUrlResponse'];
export type ServerAsset = components['schemas']['com.rewild.models.Asset'];
type ImageUploadRequest = components['schemas']['com.rewild.models.ProjectImageUploadRequest'];
type ImageResponse = components['schemas']['com.rewild.models.ProjectImageResponse'];

// Step 1 of upload: server validates level ownership, inserts an unconfirmed
// asset record, and returns a presigned PUT URL for direct upload to object
// storage plus the public URL the asset will be reachable at once confirmed.
export async function requestUploadUrl(
  levelId: string,
  assetType: string,
  filename: string
): Promise<UploadUrlResponse> {
  const res = await apiFetch('/api/assets/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ levelId, assetType, filename }),
  });
  if (!res.ok) throw new Error(`upload-url failed: ${res.status}`);
  return res.json();
}

// Step 2 of upload: tells the server the direct PUT to object storage
// succeeded. Marks the asset record as confirmed so it appears in sync.
// The server also purges any unconfirmed records older than 1 hour.
export async function confirmUpload(storageKey: string): Promise<void> {
  const res = await apiFetch('/api/assets/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storageKey }),
  });
  if (!res.ok) throw new Error(`confirm failed: ${res.status}`);
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

/** Returns why the file cannot be a project image, or null when it can. */
export function projectImageProblem(file: File): string | null {
  if (!PROJECT_IMAGE_TYPES.includes(file.type))
    return 'The image must be a PNG, JPEG or WebP file';
  if (file.size > MAX_PROJECT_IMAGE_BYTES) return 'The image must be 2 MB or smaller';
  return null;
}

/** Uploads the image of a project saved on the server. Resolves to its URL. */
export async function uploadProjectImage(projectId: string, file: File): Promise<string> {
  const problem = projectImageProblem(file);
  if (problem) throw new Error(problem);

  const base = `/api/projects/${encodeURIComponent(projectId)}/image`;
  const urlRes = await apiFetch(`${base}/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: file.type, size: file.size } satisfies ImageUploadRequest),
  });
  if (!urlRes.ok) throw await responseError(urlRes, 'Could not upload the image');
  const { uploadUrl, storageKey } = (await urlRes.json()) as UploadUrlResponse;

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error(`Could not upload the image (${putRes.status})`);

  const confirmRes = await apiFetch(`${base}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storageKey }),
  });
  if (!confirmRes.ok) throw await responseError(confirmRes, 'Could not upload the image');
  const { imageUrl } = (await confirmRes.json()) as ImageResponse;
  return imageUrl;
}
