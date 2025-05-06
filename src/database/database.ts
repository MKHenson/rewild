import { IDataTable, IProject } from 'models';
import { dbs } from 'src/firebase';
import { FirestoreDataTable } from './firestore-db';
import { LocalDataTable } from './local-db';

export class Database {
  private _projects: IDataTable<IProject>;

  goOnline(online: boolean) {
    if (online) {
      this._projects = new FirestoreDataTable<IProject>(dbs.projects);
    } else {
      this._projects = new LocalDataTable<IProject>('rewild', 'projects');
    }
  }

  get projects() {
    return this._projects;
  }
}

export const db = new Database();
db.goOnline(false);
