import {
  ILevel,
  IProject,
  IContainer,
  IActor,
  IContainerPod,
  StoredRecord,
} from 'models';
import { createUUID } from 'rewild-ui';
import {
  getLevel as getLevelApi,
  patchLevel,
  patchProject,
  getProject as getProjectApi,
} from '../../api';
import { sceneGraphStore } from './SceneGraphStore';
import { createExporterObj } from '../utils/exportHelper';
import { Dispatcher } from 'rewild-common';
import { db } from 'src/database/database';

export type ProjectStoreEvents =
  | { kind: 'loading-completed'; project: IProject }
  | { kind: 'loading-initiated' }
  | { kind: 'changed' };

export class ProjectStore {
  loading = false;
  dirty = false;
  error?: string;
  level: StoredRecord<ILevel> | null = null;
  project: StoredRecord<IProject> | null = null;

  readonly dispatcher = new Dispatcher<ProjectStoreEvents>();
  containerPods: { [id: string]: IContainerPod };

  constructor() {
    this.containerPods = {};
  }

  static createProject(): IProject {
    return {
      id: createUUID(),
      name: 'New Project',
      description: '',
      activeOnStartup: true,
      levelId: '',
      startEvent: '',
      sceneGraph: {
        atmosphere: {
          cloudiness: 0.7,
          foginess: 0.3,
          windiness: 0.5,
          precipitation: 0.0,
          temperature: 0.5,
          elevation: 80,
          dayNightCycle: false,
        },
        containers: [],
      },
    };
  }

  async getProject(projectId: string) {
    this.loading = true;
    this.dispatcher.dispatch({ kind: 'loading-initiated' });
    this.dispatcher.dispatch({ kind: 'changed' });

    try {
      const resp = await getProjectApi(projectId);
      this.project = resp;

      await this.getLevel(resp!.id);
    } catch (err: any) {
      this.error = err.toString();
    }

    this.loading = false;
    this.dirty = false;
    this.dispatcher.dispatch({ kind: 'changed' });

    const project = this.project!;

    this.containerPods = {};
    project.sceneGraph?.containers?.forEach((container) => {
      this.containerPods[container.id] = container.pod || {
        asset3D: [],
      };
    });

    sceneGraphStore.buildTreeFromProject(project);
    this.dispatcher.dispatch({
      kind: 'loading-completed',
      project: this.project!,
    });
  }

  async updateProject() {
    const project = this.project!;
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
              pod: containerNode.resource?.id
                ? this.containerPods[containerNode.resource?.id]
                : { asset3D: [] },
            } as IContainer)
        ) || [],
      atmosphere: {
        ...sceneGraphStore.buildObjectFromProperties('SKY')!,
      },
    };

    this.loading = true;
    this.dispatcher.dispatch({ kind: 'changed' });

    try {
      await patchProject(id!, createExporterObj(token));
    } catch (err: any) {
      this.error = err.toString();
    }

    this.loading = false;
    this.dirty = false;
    this.dispatcher.dispatch({ kind: 'changed' });

    db.syncAll(); // background — errors captured on records via syncError
  }

  async publish() {
    await this.updateProject();
    this.loading = true;
    this.dispatcher.dispatch({ kind: 'changed' });

    const project = this.project!;
    const containers = sceneGraphStore.nodes.find(
      (n) => n.name === 'Containers'
    )!.children;

    try {
      await patchLevel(project.levelId!, {
        containers:
          containers?.map(
            (c) =>
              ({
                ...c.resource,
                pod: c.resource?.id
                  ? this.containerPods[c.resource?.id]
                  : { asset3D: [] },
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
      this.error = err.toString();
    }

    await this.getLevel(project.id!);

    this.loading = false;
    this.dirty = false;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  async getLevel(projectId: string) {
    const level = await getLevelApi(projectId);
    this.level = level;
  }
}

export const projectStore = new ProjectStore();
