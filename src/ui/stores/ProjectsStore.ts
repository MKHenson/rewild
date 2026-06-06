import { ILevel, IProject } from 'models';
import {
  addLevel,
  addProject as addProjectApi,
  getProject,
  deleteLevel,
  deleteProject,
  getProjects as getProjectsApi,
  patchProject,
} from '../../api';
import { Dispatcher } from 'rewild-common';

export type ProjectsStoreEvents = { kind: 'changed' };

export class ProjectsStore {
  loading = false;
  error?: string;
  projects: IProject[] = [];

  readonly dispatcher = new Dispatcher<ProjectsStoreEvents>();

  async getProjects(page?: any) {
    this.loading = true;
    this.dispatcher.dispatch({ kind: 'changed' });
    const resp = await getProjectsApi(false, page);
    this.projects = resp;
    this.loading = false;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  async addProject(token: Partial<IProject>) {
    if (!token) return;
    this.loading = true;
    this.error = '';
    this.dispatcher.dispatch({ kind: 'changed' });

    try {
      const resp = await addProjectApi(token);

      const newLevel: ILevel = {
        containers: [],
        hasTerrain: true,
        name: token.name || '',
        startEvent: token.startEvent || '',
        projectId: resp.id,
        activeOnStartup: token.activeOnStartup || true,
      };
      const levelResp = await addLevel(newLevel);
      patchProject(resp.id, { levelId: levelResp.id });

      await this.getProjects();
    } catch (err: any) {
      this.error = err.toString();
    }

    this.loading = false;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  async removeProjects(id: string) {
    this.loading = true;
    this.error = '';
    this.dispatcher.dispatch({ kind: 'changed' });

    try {
      const project = await getProject(id);
      await deleteProject(id);
      await deleteLevel(project!.levelId);
      await this.getProjects();
    } catch (err: any) {
      this.error = err.toString();
    }

    this.loading = false;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  async updateProject(project: IProject) {
    const { id, ...token } = project;
    await patchProject(id!, token);
  }

  async functionsTest() {
    throw new Error('functionsTest: not implemented');
  }
}

export const projectsStore = new ProjectsStore();
