import type { SyncableRecord } from 'models';
import { authService } from '../api/auth/auth-service';
import { deleteServerProject } from '../api/projects';
import { projectImageAsset } from '../api/assets/asset-api';
import { SyncEngine } from '../api/sync/sync-engine';
import { AssetReader, AssetRef, LevelRef, LocalAssetStore } from './local-asset-store';
import { LocalLevelTable } from './local-level-table';
import { LocalProjectTable } from './local-project-table';

/** True once a record has reached the server at least once. */
export function isSavedOnServer(record: SyncableRecord): boolean {
  return record.syncedAt > 0;
}

export class Database {
  readonly projects = new LocalProjectTable();
  readonly levels = new LocalLevelTable();
  readonly assets = new LocalAssetStore();
  readonly sync = new SyncEngine(
    { projects: this.projects, levels: this.levels },
    authService
  );

  // Syncs and clears run one at a time. A clear during a sync would let the
  // sync's asset pull download the files the clear removed.
  private queue: Promise<unknown> = Promise.resolve();

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  syncAll(): Promise<void> {
    return this.exclusive(async () => {
      // The asset pull needs the server to know the level clears first, so a
      // failed record sync skips it.
      if (await this.sync.run()) await this.assets.sync();
    });
  }

  /** Writes a file on this device. The next sync uploads it. */
  writeAsset(asset: AssetRef & { contentType?: string }, data: ArrayBuffer | Blob): Promise<string> {
    return this.exclusive(() => this.assets.write(asset, data));
  }

  /** The project's image: the copy on this device, else a download from `imageUrl`, else null. */
  async getProjectImage(project: { id?: string; imageUrl?: string | null }): Promise<Blob | null> {
    if (!project.id) return null;
    const local = await this.assets.readBlob(projectImageAsset(project.id)).catch(() => null);
    if (local || !project.imageUrl) return local;

    try {
      const res = await fetch(project.imageUrl);
      return res.ok ? await res.blob() : null;
    } catch {
      return null;
    }
  }

  /**
   * Deletes a project, its levels and their files. A project saved on the
   * server is deleted there first, and a failure leaves the local copy in place.
   */
  deleteProject(id: string): Promise<void> {
    return this.exclusive(async () => {
      const project = await this.projects.getOne(id);
      if (!project) return;
      if (isSavedOnServer(project)) await deleteServerProject(id);

      const levels = await this.levels.getMany({
        where: [['projectId', '==', id]],
      });
      for (const level of levels.items) await this.levels.hardRemove(level.id);
      await this.assets.removeByProject(id);
      await this.projects.hardRemove(id);
    });
  }

  /** Removes all of the level's chunk files: heights, paint, scatter and water.
   *  The next sync removes the server's copies too. */
  clearLevelChunks(levelId: string): Promise<void> {
    return this.exclusive(async () => {
      await this.assets.removeChunksByLevel(levelId);
      await this.levels.markCleared(levelId);
    });
  }
}

export const db = new Database();

/** Reads a level's files from this device. */
export function localAssetReader(level: LevelRef): AssetReader {
  return (assetType, filename) => db.assets.read({ ...level, assetType, filename });
}

// Sync is auth-gated and local-first: edits made while logged out sit dirty in
// IndexedDB/OPFS. Flush them promptly once a user is authenticated (login,
// register, or token refresh) instead of waiting for the next save/publish.
authService.onAuthStateChanged.add((user) => {
  if (user)
    db.syncAll().catch((err) => console.warn('Post-login sync failed:', err));
});
