import { ILevel, IProject } from "models";
import { Store } from "../Store";
import {
  addLevel,
  addProject as addProjectApi,
  getProject,
  deleteLevel,
  deleteProject,
  getProjects as getProjectsApi,
  patchProject,
} from "../../../api";
import { Timestamp, QueryDocumentSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../firebase";

const helloworld = httpsCallable(functions, "helloworld");

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

  async getProjects(page?: QueryDocumentSnapshot<IProject>) {
    this.defaultProxy.loading = true;
    this.defaultProxy.projects = await getProjectsApi(false, page);
    this.defaultProxy.loading = false;
  }

  async addProject(token: Partial<IProject>) {
    if (!token) return;
    this.defaultProxy.loading = true;
    this.defaultProxy.error = "";

    try {
      token.created = Timestamp.now();
      token.lastModified = Timestamp.now();
      const resp = await addProjectApi(token);

      const newLevel: ILevel = {
        containers: [],
        startEvent: token.startEvent || "",
        created: Timestamp.now(),
        lastModified: Timestamp.now(),
        project: resp.id,
        activeOnStartup: token.activeOnStartup || true,
      };
      const levelResp = await addLevel(newLevel);
      patchProject(resp, { level: levelResp.id });

      await this.getProjects();
    } catch (err: any) {
      this.defaultProxy.error = err.toString();
    }

    this.defaultProxy.loading = false;
  }

  async removeProjects(id: string) {
    this.defaultProxy.loading = true;
    this.defaultProxy.error = "";

    try {
      const project = await getProject(id);
      await deleteProject(id);
      await deleteLevel(project.level);
      await this.getProjects();
    } catch (err: any) {
      this.defaultProxy.error = err.toString();
    }

    this.defaultProxy.loading = false;
  }

  async updateProject(project: IProject) {
    const { id, ...token } = project;
    token.lastModified = Timestamp.now();
    await patchProject(id!, token);
  }

  // This is just a reference for the future
  async functionsTest() {
    const functionResult = await helloworld({ foo: "bar" });
    return functionResult.data;
  }
}

export const projectsStore = new ProjectsStore();
