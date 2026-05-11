import { apiFetch } from '../auth/api-client';
import type { components } from '../../types/api';

type UploadUrlResponse =
  components['schemas']['com.rewild.models.UploadUrlResponse'];
type ServerAsset = components['schemas']['com.rewild.models.Asset'];

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
