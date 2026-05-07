import { ILevel, IProject } from 'models';
import { authService } from '../api/auth/auth-service';
import { SyncEngine } from '../api/sync/sync-engine';
import { LocalDataTable } from './local-db';

export class Database {
  readonly projects = new LocalDataTable<IProject>('rewild', 'projects');
  readonly levels = new LocalDataTable<ILevel>('rewild', 'levels');
  readonly sync = new SyncEngine({ projects: this.projects, levels: this.levels }, authService);
}

export const db = new Database();
