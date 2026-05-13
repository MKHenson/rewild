import type { IDataTableQuery, SyncableRecord } from 'models';
import { generateUUID } from 'rewild-common';

export type StoredRecord<T> = T & SyncableRecord & { id: string };

export function withSyncDefaults<T>(record: T & { id: string }): StoredRecord<T> {
  return {
    updatedAt: 0,
    syncedAt: 0,
    syncError: null,
    ...record,
  } as StoredRecord<T>;
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const DB_VERSION = 1;
// Mirrors server migration V1__create_schema.sql + V3__create_assets.sql
const KNOWN_STORES = ['projects', 'levels', 'assets'] as const;
const dbCache = new Map<string, Promise<IDBDatabase>>();


function openDatabase(dbName: string): Promise<IDBDatabase> {
  const cached = dbCache.get(dbName);
  if (cached) return cached;

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result; 

      for (const store of KNOWN_STORES) {
        if (!db.objectStoreNames.contains(store)) {
          const objectStore = db.createObjectStore(store, { keyPath: 'id' });
          objectStore.createIndex('updatedAt', 'updatedAt');
        }
      } 
    };

    request.onsuccess = () => {
      resolve((request as IDBOpenDBRequest).result);
    };

    request.onerror = () => reject(request.error);
  });

  dbCache.set(dbName, promise);
  return promise;
}

export async function clearDatabase(dbName: string): Promise<void> {
  const db = await openDatabase(dbName);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([...KNOWN_STORES], 'readwrite');
    for (const store of KNOWN_STORES) tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export class LocalDataTable<T> {
  readonly db: string;
  readonly collection: string;

  constructor(db: string, collection: string) {
    this.db = db;
    this.collection = collection;
  }

  get prefix() {
    return `${this.db}.${this.collection}`;
  }

  private async openStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await openDatabase(this.db);
    return db.transaction(this.collection, mode).objectStore(this.collection);
  }

  async getOne(id: string): Promise<StoredRecord<T> | null> {
    const store = await this.openStore('readonly');
    const result = await idbReq<StoredRecord<T> | undefined>(store.get(id));
    return result ? withSyncDefaults(result) : null;
  }

  async getMany<Query = T>(q: IDataTableQuery<Query>) {
    const store = await this.openStore('readonly');
    let allItems = (await idbReq<StoredRecord<T>[]>(store.getAll())).map(withSyncDefaults);

    if (q.sort) {
      for (const [prop, order] of q.sort) {
        allItems = allItems.sort((a, b) => {
          const aValue = a[prop as unknown as keyof T];
          const bValue = b[prop as unknown as keyof T];
          if (aValue == null && bValue == null) return 0;
          if (aValue == null) return 1;
          if (bValue == null) return -1;
          if (aValue < bValue) return order === 'asc' ? -1 : 1;
          if (aValue > bValue) return order === 'asc' ? 1 : -1;
          return 0;
        });
      }
    }

    const filteredItems = allItems.filter((item) => {
      if (!q.where) return true;
      for (const [prop, comparitor, value] of q.where) {
        const entryValue = item[prop as unknown as keyof T];
        if (comparitor === '==' && entryValue !== value) return false;
        if (comparitor === '!=' && entryValue === value) return false;
        if (comparitor === '<' && !(entryValue < value)) return false;
        if (comparitor === '<=' && !(entryValue <= value)) return false;
        if (comparitor === '>' && !(entryValue > value)) return false;
        if (comparitor === '>=' && !(entryValue >= value)) return false;
      }
      return true;
    });

    let cursor = 0;
    if (typeof q.cursor === 'number') cursor = q.cursor;
    else if (q.cursor && typeof q.cursor === 'string')
      cursor = filteredItems.findIndex((item) => (item as unknown as { id: string }).id === q.cursor);

    let limit = q.limit || filteredItems.length;
    if (cursor + limit > filteredItems.length) limit = filteredItems.length - cursor;

    const slicedItems = filteredItems.slice(cursor, cursor + limit);

    return {
      items: slicedItems,
      cursor: filteredItems.length ? filteredItems.indexOf(slicedItems.at(-1)!) + 1 : 0,
    };
  }

  async remove(id: string): Promise<boolean> {
    const db = await openDatabase(this.db);
    const tx = db.transaction(this.collection, 'readwrite');
    const store = tx.objectStore(this.collection);
    const existing = await idbReq<StoredRecord<T> | undefined>(store.get(id));
    if (!existing) return false;
    await idbReq(store.delete(id));
    return true;
  }

  async add(token: T): Promise<StoredRecord<T>> {
    const record: StoredRecord<T> = {
      ...token,
      id: generateUUID(),
      updatedAt: Date.now(),
      syncedAt: 0,
      syncError: null,
    };
    const store = await this.openStore('readwrite');
    await idbReq(store.put(record));
    return record;
  }

  async patch(id: string, token: Partial<T>): Promise<void> {
    const db = await openDatabase(this.db);
    const tx = db.transaction(this.collection, 'readwrite');
    const store = tx.objectStore(this.collection);
    const existing = await idbReq<StoredRecord<T> | undefined>(store.get(id));
    if (existing) {
      await idbReq(store.put({ ...withSyncDefaults(existing), ...token, updatedAt: Date.now() }));
    }
  }

  async getDirty(): Promise<StoredRecord<T>[]> {
    const store = await this.openStore('readonly');
    const allItems = (await idbReq<StoredRecord<T>[]>(store.getAll())).map(withSyncDefaults);
    return allItems.filter((item) => item.updatedAt > item.syncedAt);
  }

  async markSynced(id: string, syncedAt: number, syncError: string | null): Promise<void> {
    const db = await openDatabase(this.db);
    const tx = db.transaction(this.collection, 'readwrite');
    const store = tx.objectStore(this.collection);
    const existing = await idbReq<StoredRecord<T> | undefined>(store.get(id));
    if (existing) {
      await idbReq(store.put({ ...withSyncDefaults(existing), syncedAt, syncError }));
    }
  }

  async putSynced(record: T & { id: string; updatedAt: number }, syncedAt: number): Promise<void> {
    const stored: StoredRecord<T> = { ...record, syncedAt, syncError: null };
    const store = await this.openStore('readwrite');
    await idbReq(store.put(stored));
  }
}
