-- The project all players see in Story Mode. A single row; project_id is null when nothing is promoted.
CREATE TABLE public_game (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
);

INSERT INTO public_game (id, project_id) VALUES (1, NULL);
