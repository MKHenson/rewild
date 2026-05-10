import type { IProject } from 'models';
import { LocalDataTable } from './local-db';

export class LocalProjectTable extends LocalDataTable<IProject> {
  constructor() {
    super('rewild', 'projects');
  }
}
