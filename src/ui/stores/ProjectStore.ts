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
  /** The open level has unsaved changes. */
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
    this.beginLoad();

    try {
      const project = await getProjectApi(projectId);
      if (!project) throw new Error('Project not found');
      this.project = project;
      this.level = await this.fetchLevel(project.levelId);
    } catch (err: any) {
      this.error = err.toString();
    }

    this.endLoad();
  }

  /** Opens another level in the editor. Unsaved changes are saved first. */
  async loadLevel(levelId: string) {
    if (!this.project || this.loading || this.level?.id === levelId) return;

    if (this.dirty) {
      await this.saveLevel();
      if (this.dirty) return;
    }

    sceneGraphStore.setActiveContainer(null);
    sceneGraphStore.setSelectedNode(null);
    this.beginLoad();

    try {
      this.level = await this.fetchLevel(levelId);
    } catch (err: any) {
      this.error = err.toString();
    }

    this.endLoad();
  }

  /** Makes a level the project's start level. Written at once, so the level stays clean. */
  async setStartLevel(levelId: string) {
    const project = this.project;
    if (!project || project.levelId === levelId) return;

    try {
      await patchProject(project.id, { levelId });
      project.levelId = levelId;
    } catch (err: any) {
      this.error = err.toString();
    }

    this.dispatcher.dispatch({ kind: 'changed' });
    db.syncAll(); // background — errors captured on records via syncError
  }

  /** Saves the project's own fields, such as its name and start level. */
  async saveProject() {
    // imageUrl is set by the image sync; a copy held here can be stale.
    const { id, imageUrl, ...token } = this.project!;

    await this.write(() => patchProject(id, createExporterObj(token)));
  }

  /** Saves the editor's scene graph to the open level and clears `dirty`. */
  async saveLevel() {
    const level = this.level!;
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

    const saved = await this.write(() =>
      patchLevel(level.id, { sceneGraph: createExporterObj(sceneGraph) })
    );
    if (!saved) return;

    level.sceneGraph = sceneGraph;
    this.dirty = false;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  private async fetchLevel(levelId: string) {
    const level = await getLevelApi(levelId);
    level.sceneGraph ??= ProjectStore.createSceneGraph();
    return level;
  }

  private beginLoad() {
    this.loading = true;
    this.dispatcher.dispatch({ kind: 'loading-initiated' });
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  private endLoad() {
    const project = this.project;
    const level = this.level;
    const loaded = !this.error && project && level;

    if (loaded) {
      this.containerPods = {};
      level.sceneGraph.containers.forEach((container) => {
        this.containerPods[container.id] = container.pod || {
          asset3D: [],
        };
      });
      // Building the tree reports its nodes as updated, which would mark the
      // fresh level dirty, so dirty is cleared after it.
      sceneGraphStore.buildTreeFromSceneGraph(level.sceneGraph);
    }

    this.loading = false;
    this.dirty = false;
    this.dispatcher.dispatch({ kind: 'changed' });

    if (loaded)
      this.dispatcher.dispatch({ kind: 'loading-completed', project, level });
  }

  // Resolves false when the write failed; `error` says why.
  private async write(task: () => Promise<void>): Promise<boolean> {
    this.loading = true;
    this.dispatcher.dispatch({ kind: 'changed' });

    let ok = true;
    try {
      await task();
    } catch (err: any) {
      this.error = err.toString();
      ok = false;
    }

    this.loading = false;
    this.dispatcher.dispatch({ kind: 'changed' });

    db.syncAll(); // background — errors captured on records via syncError
    return ok;
  }
}

export const projectStore = new ProjectStore();
