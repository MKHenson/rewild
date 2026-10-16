import {
  ILevel,
  IProject,
  IContainer,
  IContainerPod,
  ISceneGraph,
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
import { LevelRef } from 'src/database/local-asset-store';

export type ProjectStoreEvents =
  | {
      kind: 'loading-completed';
      project: StoredRecord<IProject>;
      level: StoredRecord<ILevel>;
    }
  | { kind: 'loading-initiated' }
  | { kind: 'changed' };

export class ProjectStore {
  loading = false;
  dirty = false;
  error?: string;
  project: StoredRecord<IProject> | null = null;
  /** The level open in the editor. Save writes the scene graph to it. */
  level: StoredRecord<ILevel> | null = null;

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
      levelId: '',
    };
  }

  static createSceneGraph(): ISceneGraph {
    return {
      atmosphere: {
        cloudiness: 0.7,
        foginess: 0.3,
        windiness: 0.5,
        windDirection: 180,
        precipitation: 0.0,
        temperature: 0.5,
        elevation: 80,
        dayNightCycle: false,
        weatherState: 'random',
        moonPhase: 0.5,
        randomMoonPhase: false,
      },
      containers: [],
      terrain: {
        version: 1,
        seed: Math.floor(Math.random() * 2147483647),
      },
    };
  }

  static createLevel(projectId: string, name: string): ILevel {
    return {
      name,
      projectId,
      hasTerrain: true,
      startEvent: '',
      sceneGraph: ProjectStore.createSceneGraph(),
    };
  }

  /** The files of the level open in the editor. */
  get levelRef(): LevelRef | null {
    return this.project && this.level
      ? { projectId: this.project.id, levelId: this.level.id }
      : null;
  }

  async getProject(projectId: string) {
    this.loading = true;
    this.dispatcher.dispatch({ kind: 'loading-initiated' });
    this.dispatcher.dispatch({ kind: 'changed' });

    try {
      const project = await getProjectApi(projectId);
      if (!project) throw new Error('Project not found');
      this.project = project;
      this.level = await getLevelApi(project.levelId);
      this.level.sceneGraph ??= ProjectStore.createSceneGraph();
    } catch (err: any) {
      this.error = err.toString();
    }

    this.loading = false;
    this.dirty = false;
    this.dispatcher.dispatch({ kind: 'changed' });

    const project = this.project;
    const level = this.level;
    if (this.error || !project || !level) return;

    this.containerPods = {};
    level.sceneGraph.containers.forEach((container) => {
      this.containerPods[container.id] = container.pod || {
        asset3D: [],
      };
    });

    sceneGraphStore.buildTreeFromSceneGraph(level.sceneGraph);
    this.dispatcher.dispatch({ kind: 'loading-completed', project, level });
  }

  /** Saves the project's fields and the editor's scene graph to the open level. */
  async updateProject() {
    const project = this.project!;
    const level = this.level!;
    // imageUrl is set by the image sync; a copy held here can be stale.
    const { id, imageUrl, ...token } = project;
    const containerNodes = sceneGraphStore.nodes.find(
      (n) => n.name === 'Containers'
    )!.children;

    const sceneGraph: ISceneGraph = {
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
      terrain: level.sceneGraph.terrain,
    };
    level.sceneGraph = sceneGraph;

    this.loading = true;
    this.dispatcher.dispatch({ kind: 'changed' });

    try {
      await patchProject(id!, createExporterObj(token));
      await patchLevel(level.id, { sceneGraph: createExporterObj(sceneGraph) });
    } catch (err: any) {
      this.error = err.toString();
    }

    this.loading = false;
    this.dirty = false;
    this.dispatcher.dispatch({ kind: 'changed' });

    db.syncAll(); // background — errors captured on records via syncError
  }
}

export const projectStore = new ProjectStore();
