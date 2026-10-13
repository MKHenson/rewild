-- When the file was last confirmed. Versions its public URL so caches never serve an old copy.
ALTER TABLE assets ADD COLUMN updated_at BIGINT NOT NULL DEFAULT 0;
UPDATE assets SET updated_at = created_at;
