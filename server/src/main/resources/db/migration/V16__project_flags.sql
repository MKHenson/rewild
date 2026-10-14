-- Set by a super admin to block a project. A flagged project cannot be played by anyone but its owner and super admins.
ALTER TABLE projects ADD COLUMN flagged_at BIGINT;
ALTER TABLE projects ADD COLUMN flagged_by TEXT;
