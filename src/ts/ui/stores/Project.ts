import { ILevel, IProject } from "models";
import { Store } from "../Store";
import { getLevel as getLevelApi, patchLevel, patchProject, getProject as getProjectApi } from "../../../api";
import { Timestamp } from "firebase/firestore";

export interface IProjectStore {
  loading: boolean;
  dirty: boolean;
  error?: string;
  level: ILevel | null;
  project: IProject | null;
}

export class ProjectStore extends Store<IProjectStore> {
  constructor() {
    super({
      loading: false,
      dirty: false,
      level: null,
      project: null,
      error: undefined,
    });
  }

  async getProject(projectId: string) {
    this.defaultProxy.loading = true;

    try {
      const resp = await getProjectApi(projectId);
      this.defaultProxy.project = { ...resp, id: projectId };

      await this.getLevel(resp.id);
    } catch (err: any) {
      this.defaultProxy.error = err.toString();
    }

    this.setTarget({
      loading: false,
      dirty: false,
    });
  }

  async updateProject() {
    const project = this.defaultProxy.project!;
    const { id, ...token } = project;
    token.lastModified = Timestamp.now();
    this.defaultProxy.loading = true;

    try {
      await patchProject(id!, token);
    } catch (err: any) {
      this.defaultProxy.error = err.toString();
    }

    this.setTarget({
      loading: false,
      dirty: false,
    });
  }

  async publish() {
    await this.updateProject();
    this.defaultProxy.loading = true;

    const project = this.defaultProxy.project!;

    await patchLevel(project.level!, {
      lastModified: Timestamp.now(),
      containers: project.containers?.slice(0),
      activeOnStartup: project.activeOnStartup,
      startEvent: project.startEvent,
    });

    await this.getLevel(project.id!);

    this.setTarget({
      loading: false,
      dirty: false,
    });
  }

  async getLevel(projectId: string) {
    const level = await getLevelApi(projectId);
    this.defaultProxy.level = level;
  }
}

export const projectStore = new ProjectStore();
