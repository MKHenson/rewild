CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL,
    filename TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL
);
