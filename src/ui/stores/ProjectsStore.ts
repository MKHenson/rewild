import { ILevel, IProject } from 'models';
import { Store } from 'rewild-ui';
import {
  addLevel,
  addProject as addProjectApi,
  getProject,
  deleteLevel,
  deleteProject,
  getProjects as getProjectsApi,
  patchProject,
} from '../../api';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

const helloworld = httpsCallable(functions, 'helloworld');

export interface IProjectStore {
  loading: boolean;
  error?: string;
  projects: IProject[];
}

export class ProjectsStore extends Store<IProjectStore> {
  constructor() {
    super({
      loading: false,
      projects: [],
      error: undefined,
    });
  }

  async getProjects(page?: any) {
    this.defaultProxy.loading = true;
    const resp = await getProjectsApi(false, page);
    this.defaultProxy.projects = resp;
    this.defaultProxy.loading = false;
  }

  async addProject(token: Partial<IProject>) {
    if (!token) return;
    this.defaultProxy.loading = true;
    this.defaultProxy.error = '';

    try {
      token.created = Date.now();
      token.lastModified = Date.now();
      const resp = await addProjectApi(token);

      const newLevel: ILevel = {
        containers: [],
        hasTerrain: true,
        name: token.name || '',
        startEvent: token.startEvent || '',
        created: Date.now(),
        lastModified: Date.now(),
        project: resp.id,
        activeOnStartup: token.activeOnStartup || true,
      };
      const levelResp = await addLevel(newLevel);
      patchProject(resp.id, { level: levelResp.id });

      await this.getProjects();
    } catch (err: any) {
      this.defaultProxy.error = err.toString();
    }

    this.defaultProxy.loading = false;
  }

  async removeProjects(id: string) {
    this.defaultProxy.loading = true;
    this.defaultProxy.error = '';

    try {
      const project = await getProject(id);
      await deleteProject(id);
      await deleteLevel(project!.level);
      await this.getProjects();
    } catch (err: any) {
      this.defaultProxy.error = err.toString();
    }

    this.defaultProxy.loading = false;
  }

  async updateProject(project: IProject) {
    const { id, ...token } = project;
    token.lastModified = Date.now();
    await patchProject(id!, token);
  }

  // This is just a reference for the future
  async functionsTest() {
    const functionResult = await helloworld({ foo: 'bar' });
    return functionResult.data;
  }
}

export const projectsStore = new ProjectsStore();
