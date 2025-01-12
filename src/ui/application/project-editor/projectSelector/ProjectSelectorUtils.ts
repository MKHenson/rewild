import { IWorkspace, IProject } from 'models';
import { createUUID } from 'rewild-ui';

export const createDefaultWorkspace = (): IWorkspace => {
  return {
    cells: [
      {
        editor: 'project-settings',
        colStart: 1,
        colEnd: 2,
        rowStart: 2,
        rowEnd: 4,
      },
      {
        editor: 'actors',
        colStart: 1,
        colEnd: 2,
        rowStart: 4,
        rowEnd: 6,
      },
      {
        editor: 'ribbon',
        colStart: 3,
        colEnd: 4,
        rowStart: 1,
        rowEnd: 2,
      },
      {
        editor: 'properties',
        colStart: 5,
        colEnd: 6,
        rowStart: 2,
        rowEnd: 3,
      },
      {
        editor: 'scene-graph',
        colStart: 5,
        colEnd: 6,
        rowStart: 3,
        rowEnd: 6,
      },
      {
        editor: 'viewport',
        colStart: 2,
        colEnd: 5,
        rowStart: 2,
        rowEnd: 6,
      },
    ],
  };
};

export function createProject() {
  const project = {
    id: createUUID(),
    name: 'New Project',
    containers: [],
    description: '',
    activeOnStartup: true,
    startEvent: '',
    workspace: createDefaultWorkspace(),
  } as Partial<IProject>;

  return project;
}
