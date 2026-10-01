import { authService } from '../api/auth/auth-service';
import { SyncEngine } from '../api/sync/sync-engine';
import { LocalAssetStore } from './local-asset-store';
import { LocalLevelTable } from './local-level-table';
import { LocalProjectTable } from './local-project-table';

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

// Sync is auth-gated and local-first: edits made while logged out sit dirty in
// IndexedDB/OPFS. Flush them promptly once a user is authenticated (login,
// register, or token refresh) instead of waiting for the next save/publish.
authService.onAuthStateChanged.add((user) => {
  if (user)
    db.syncAll().catch((err) => console.warn('Post-login sync failed:', err));
});
