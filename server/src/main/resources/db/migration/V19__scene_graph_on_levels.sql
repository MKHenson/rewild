ALTER TABLE levels ADD COLUMN scene_graph JSONB;
UPDATE levels SET scene_graph = projects.scene_graph FROM projects WHERE projects.id = levels.project_id;
ALTER TABLE levels ALTER COLUMN scene_graph SET NOT NULL;
ALTER TABLE levels DROP COLUMN containers;
ALTER TABLE projects DROP COLUMN scene_graph;
ALTER TABLE projects DROP COLUMN start_event;
