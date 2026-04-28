import type { IDataTable, IDataTableQuery } from 'models';

/**
 * REST-backed data table targeting the Ktor server.
 * Replaces FirestoreDataTable. Methods are stubs until the server is implemented.
 */
export class ApiDataTable<T> implements IDataTable<T> {
  private readonly collection: string;

  constructor(collection: string) {
    this.collection = collection;
  }

  async getOne(_id: string): Promise<(T & { id: string }) | null> {
    throw new Error(`ApiDataTable(${this.collection}).getOne: not implemented`);
  }

  async getMany<Query = T>(_query: IDataTableQuery<Query>): Promise<{
    items: (T & { id: string })[];
    cursor: string | number | Partial<T>;
  }> {
    throw new Error(`ApiDataTable(${this.collection}).getMany: not implemented`);
  }

  async remove(_id: string): Promise<boolean> {
    throw new Error(`ApiDataTable(${this.collection}).remove: not implemented`);
  }

  async add(_token: T): Promise<T & { id: string }> {
    throw new Error(`ApiDataTable(${this.collection}).add: not implemented`);
  }

  async patch(_id: string, _token: Partial<T>): Promise<void> {
    throw new Error(`ApiDataTable(${this.collection}).patch: not implemented`);
  }
}
