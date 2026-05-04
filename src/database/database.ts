import { IDataTable, ILevel, IProject } from 'models';
import { LocalDataTable } from './local-db';
import { SyncEngine } from '../api/sync/sync-engine';

export class Database {
  readonly projects: IDataTable<IProject> = new LocalDataTable<IProject>(
    'rewild',
    'projects'
  );
  readonly levels: IDataTable<ILevel> = new LocalDataTable<ILevel>(
    'rewild',
    'levels'
  );
  readonly sync = new SyncEngine();
}

export const db = new Database();
