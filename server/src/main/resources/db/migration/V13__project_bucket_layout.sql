ALTER TABLE projects ADD COLUMN image_key TEXT;

-- Level files moved from levels/{levelId}/ to users/{userId}/projects/{projectId}/levels/{levelId}/.
-- Old objects are dev data only: drop their rows and queue the old prefix for removal.
DELETE FROM assets WHERE storage_key LIKE 'levels/%';

INSERT INTO asset_cleanup_queue (id, prefix, attempts, created_at)
VALUES (md5(random()::text), 'levels/', 0, (extract(epoch FROM now()) * 1000)::bigint)
ON CONFLICT (prefix) DO NOTHING;
