import { ILevel, IProject, StoredRecord } from 'models';
import {
  addLevel,
  addProject as addProjectApi,
  getProjects as getProjectsApi,
  patchProject,
} from '../../api';
import { Dispatcher } from 'rewild-common';
import { db } from '../../database/database';

export type ProjectsStoreEvents = { kind: 'changed' };

export class ProjectsStore {
  loading = false;
  error?: string;
  projects: StoredRecord<IProject>[] = [];

  readonly dispatcher = new Dispatcher<ProjectsStoreEvents>();

  async getProjects(page?: any) {
    this.loading = true;
    this.dispatcher.dispatch({ kind: 'changed' });
    const resp = await getProjectsApi(page);
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
      };
      const levelResp = await addLevel(newLevel);
      await patchProject(resp.id, { levelId: levelResp.id });

      await this.getProjects();
    } catch (err: any) {
      this.error = err.toString();
    }

    this.loading = false;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  /** Resolves false when the delete failed; `error` says why. */
  async deleteProject(id: string): Promise<boolean> {
    this.loading = true;
    this.error = '';
    this.dispatcher.dispatch({ kind: 'changed' });

    let deleted = true;
    try {
      await db.deleteProject(id);
      await this.getProjects();
    } catch (err: any) {
      this.error = err instanceof Error ? err.message : String(err);
      deleted = false;
    }

    this.loading = false;
    this.dispatcher.dispatch({ kind: 'changed' });
    return deleted;
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
