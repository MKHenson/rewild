import { authService } from '../api/auth/auth-service';
import { SyncEngine } from '../api/sync/sync-engine';
import { LocalAssetStore } from './local-asset-store';
import { LocalLevelTable } from './local-level-table';
import { LocalProjectTable } from './local-project-table';

export class Database {
  readonly projects = new LocalProjectTable();
  readonly levels = new LocalLevelTable();
  readonly assets = new LocalAssetStore();
  readonly sync = new SyncEngine({ projects: this.projects, levels: this.levels }, authService);

  async syncAll(): Promise<void> {
    await this.sync.run();
    await this.assets.sync();
  }
}

export const db = new Database();
