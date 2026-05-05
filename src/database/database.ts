import { ILevel, IProject } from 'models';
import { LocalDataTable } from './local-db';
import { SyncEngine } from '../api/sync/sync-engine';

export class Database {
  readonly projects = new LocalDataTable<IProject>('rewild', 'projects');
  readonly levels = new LocalDataTable<ILevel>('rewild', 'levels');
  readonly sync = new SyncEngine();
}

export const db = new Database();
