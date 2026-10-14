-- Play access to a project for a user other than its owner.
CREATE TABLE project_shares (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX idx_project_shares_user_id ON project_shares(user_id);
