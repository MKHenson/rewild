import { IDataTable, ILevel, IProject } from 'models';
import { dbs } from 'src/firebase';
import { FirestoreDataTable } from './firestore-db';
import { LocalDataTable } from './local-db';

export class Database {
  private _projects: IDataTable<IProject>;
  private _levels: IDataTable<ILevel>;

  goOnline(online: boolean) {
    if (online) {
      this._projects = new FirestoreDataTable<IProject>(dbs.projects);
      this._levels = new FirestoreDataTable<ILevel>(dbs.levels);
    } else {
      this._projects = new LocalDataTable<IProject>('rewild', 'projects');
      this._levels = new LocalDataTable<ILevel>('rewild', 'levels');
    }
  }

  get projects() {
    return this._projects;
  }

  get levels() {
    return this._levels;
  }
}

export const db = new Database();
db.goOnline(false);
