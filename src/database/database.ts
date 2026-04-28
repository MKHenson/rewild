import { IDataTable, ILevel, IProject } from 'models';
import { LocalDataTable } from './local-db';

export class Database {
  readonly projects: IDataTable<IProject> = new LocalDataTable<IProject>('rewild', 'projects');
  readonly levels: IDataTable<ILevel> = new LocalDataTable<ILevel>('rewild', 'levels');
}

export const db = new Database();
