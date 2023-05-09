import { ILevel, IProject, IResource, ITreeNode, IContainer, IActor } from "models";
import { Store } from "rewild-ui";
import { getLevel as getLevelApi, patchLevel, patchProject, getProject as getProjectApi } from "../../api";
import { Timestamp } from "firebase/firestore";
import { sceneGraphStore } from "./SceneGraphStore";
import { createExporterObj } from "../utils/exportHelper";

export interface IProjectStore {
  loading: boolean;
  dirty: boolean;
  error?: string;
  level: ILevel | null;
  project: IProject | null;
  selectedResource: IResource | null;
}

function extractProp(node: ITreeNode, propName: string) {
  const property = node.resource?.properties.find((property) => property.name === propName);
  return property?.value;
}

export class ProjectStore extends Store<IProjectStore> {
  constructor() {
    super({
      loading: false,
      dirty: false,
      level: null,
      project: null,
      error: undefined,
      selectedResource: null,
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

    sceneGraphStore.buildTree(this.target.project!);
  }

  async updateProject() {
    const project = this.defaultProxy.project!;
    project.lastModified = Timestamp.now();

    const { id, ...token } = project;
    const containers = sceneGraphStore.defaultProxy.nodes.find((n) => n.name === "Containers")!.children;

    token.sceneGraph = {
      containers: containers || [],
    };

    this.defaultProxy.loading = true;

    try {
      await patchProject(id!, createExporterObj(token));
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
    const containers = sceneGraphStore.defaultProxy.nodes.find((n) => n.name === "Containers")!.children;

    try {
      await patchLevel(project.level!, {
        lastModified: Timestamp.now(),
        containers:
          containers?.map(
            (c) =>
              ({
                ...c.resource,
                activeOnStartup: extractProp(c, "Active On Startup") as boolean,
                baseContainer: extractProp(c, "Base Container") as string,
                actors: c.children?.map((child) => ({ ...child.resource } as IActor)),
              } as IContainer)
          ) || [],
        activeOnStartup: project.activeOnStartup,
        startEvent: project.startEvent,
      });
    } catch (err: any) {
      this.defaultProxy.error = err.toString();
    }

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
