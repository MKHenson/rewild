import { ILevel, IProject, IContainer, IActor, IContainerPod } from 'models';
import { Store } from 'rewild-ui';
import {
  getLevel as getLevelApi,
  patchLevel,
  patchProject,
  getProject as getProjectApi,
} from '../../api';
import { sceneGraphStore } from './SceneGraphStore';
import { createExporterObj } from '../utils/exportHelper';
import { Dispatcher } from 'rewild-common';

export interface IProjectStore {
  loading: boolean;
  dirty: boolean;
  error?: string;
  level: ILevel | null;
  project: IProject | null;
}

export type ProjectStoreEvents =
  | { kind: 'loading-completed'; project: IProject }
  | { kind: 'loading-initiated' };

export class ProjectStore extends Store<IProjectStore> {
  dispatcher: Dispatcher<ProjectStoreEvents>;
  containerPods: IContainerPod[];

  constructor() {
    super({
      loading: false,
      dirty: false,
      level: null,
      project: null,
      error: undefined,
    });

    this.containerPods = [];
    this.dispatcher = new Dispatcher<ProjectStoreEvents>();
  }

  async getProject(projectId: string) {
    this.defaultProxy.loading = true;
    this.dispatcher.dispatch({ kind: 'loading-initiated' });

    try {
      const resp = await getProjectApi(projectId);
      this.defaultProxy.project = { ...(resp as IProject), id: projectId };

      await this.getLevel(resp!.id);
    } catch (err: any) {
      this.defaultProxy.error = err.toString();
    }

    this.set({
      loading: false,
      dirty: false,
    });

    sceneGraphStore.buildTreeFromProject(this.target.project!);
    this.dispatcher.dispatch({
      kind: 'loading-completed',
      project: this.target.project!,
    });
  }

  async updateProject() {
    const project = this.defaultProxy.project!;
    project.lastModified = Date.now();

    const { id, ...token } = project;
    const containerNodes = sceneGraphStore.nodes.find(
      (n) => n.name === 'Containers'
    )!.children;

    token.sceneGraph = {
      containers:
        containerNodes?.map(
          (containerNode) =>
            ({
              ...containerNode.resource,
              actors: containerNode.children?.map((child) => ({
                ...child.resource,
              })),
              activeOnStartup: sceneGraphStore.getNodePropertyValue(
                containerNode,
                'active'
              ),
            } as IContainer)
        ) || [],
      atmosphere: {
        ...sceneGraphStore.buildObjectFromProperties('SKY')!,
      },
    };

    this.defaultProxy.loading = true;

    try {
      await patchProject(id!, createExporterObj(token));
    } catch (err: any) {
      this.defaultProxy.error = err.toString();
    }

    this.set({
      loading: false,
      dirty: false,
    });
  }

  async publish() {
    await this.updateProject();
    this.defaultProxy.loading = true;

    const project = this.defaultProxy.project!;
    const containers = sceneGraphStore.nodes.find(
      (n) => n.name === 'Containers'
    )!.children;

    try {
      await patchLevel(project.level!, {
        lastModified: Date.now(),
        containers:
          containers?.map(
            (c) =>
              ({
                ...c.resource,
                activeOnStartup: sceneGraphStore.getNodePropertyValue(
                  c,
                  'active'
                ),
                actors:
                  c.children?.map(
                    (child) => ({ ...child.resource } as IActor)
                  ) || [],
              } as IContainer)
          ) || [],
        activeOnStartup: project.activeOnStartup,
        startEvent: project.startEvent,
      });
    } catch (err: any) {
      this.defaultProxy.error = err.toString();
    }

    await this.getLevel(project.id!);

    this.set({
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
