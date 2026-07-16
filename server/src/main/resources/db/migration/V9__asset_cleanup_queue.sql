-- Bucket prefixes whose objects could not be deleted when their level was removed.
-- No FK to levels: the level row is already gone by the time a row lands here.
CREATE TABLE asset_cleanup_queue (
    id TEXT PRIMARY KEY,
    prefix TEXT NOT NULL UNIQUE,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at BIGINT NOT NULL,
    last_attempt_at BIGINT
);
