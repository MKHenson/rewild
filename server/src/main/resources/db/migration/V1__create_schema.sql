-- projects table (level_id FK added after levels table is created)
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    level_id TEXT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    active_on_startup BOOLEAN NOT NULL DEFAULT FALSE,
    start_event TEXT NOT NULL DEFAULT '',
    scene_graph JSONB NOT NULL DEFAULT '{}',
    updated_at BIGINT NOT NULL,
    synced_at BIGINT NOT NULL DEFAULT 0,
    sync_error TEXT
);

CREATE TABLE levels (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    active_on_startup BOOLEAN NOT NULL DEFAULT FALSE,
    has_terrain BOOLEAN NOT NULL DEFAULT FALSE,
    start_event TEXT NOT NULL DEFAULT '',
    containers JSONB NOT NULL DEFAULT '[]',
    updated_at BIGINT NOT NULL,
    synced_at BIGINT NOT NULL DEFAULT 0,
    sync_error TEXT
);

ALTER TABLE projects
    ADD CONSTRAINT fk_projects_level_id
    FOREIGN KEY (level_id) REFERENCES levels(id) ON DELETE SET NULL;
