-- Every file of a project is an asset: it belongs to the project, and to one of its levels or none.
ALTER TABLE assets ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
UPDATE assets SET project_id = levels.project_id FROM levels WHERE assets.level_id = levels.id;
DELETE FROM assets WHERE project_id IS NULL;
ALTER TABLE assets ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE assets ALTER COLUMN level_id DROP NOT NULL;
ALTER TABLE assets ADD COLUMN content_type TEXT NOT NULL DEFAULT 'application/octet-stream';
CREATE INDEX idx_assets_project_id ON assets(project_id);

-- The project image is now an asset. Old images are dev data.
ALTER TABLE projects DROP COLUMN image_key;
