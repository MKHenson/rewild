import { ILevel, StoredRecord } from 'models';
import { Dispatcher } from 'rewild-common';
import { addLevel, getLevels, patchLevel } from '../../api';
import { db } from '../../database/database';
import { ProjectStore, projectStore } from './ProjectStore';

export type LevelsStoreEvents = { kind: 'changed' };

/**
 * The levels of the project open in the editor. Adds, renames and removes are
 * written at once and synced, so they never dirty the project.
 */
export class LevelsStore {
  loading = false;
  error?: string;
  levels: StoredRecord<ILevel>[] = [];

  readonly dispatcher = new Dispatcher<LevelsStoreEvents>();

  async load(projectId: string) {
    await this.run(() => this.fetch(projectId));
  }

  async add(projectId: string, name = 'New Level') {
    await this.run(async () => {
      await addLevel(ProjectStore.createLevel(projectId, name));
      await this.fetch(projectId);
      this.syncInBackground();
    });
  }

  async rename(id: string, name: string) {
    const level = this.levels.find((l) => l.id === id);
    const trimmed = name.trim();
    if (!level || !trimmed || trimmed === level.name) return;

    await this.run(async () => {
      await patchLevel(id, { name: trimmed });
      level.name = trimmed;
      if (projectStore.level?.id === id) projectStore.level.name = trimmed;
      this.syncInBackground();
    });
  }

  /** The project's start level cannot be removed. */
  canRemove(id: string) {
    return projectStore.project?.levelId !== id;
  }

  async remove(id: string) {
    if (!this.canRemove(id)) return;
    const level = this.levels.find((l) => l.id === id);
    if (!level) return;

    await this.run(async () => {
      await db.deleteLevel(id);
      this.levels = this.levels.filter((l) => l !== level);
    });
  }

  private async fetch(projectId: string) {
    this.levels = await getLevels(projectId);
  }

  private async run(task: () => Promise<void>) {
    this.loading = true;
    this.error = undefined;
    this.dispatcher.dispatch({ kind: 'changed' });

    try {
      await task();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }

    this.loading = false;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  private syncInBackground() {
    db.syncAll().catch((err) => console.warn('Level sync failed:', err));
  }
}

export const levelsStore = new LevelsStore();
