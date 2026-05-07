import type { IDataTableQuery, SyncableRecord } from 'models';
import { generateUUID } from 'rewild-common';

type StoredRecord<T> = T & SyncableRecord & { id: string };

function withSyncDefaults<T>(record: T & { id: string }): StoredRecord<T> {
  return {
    updatedAt: 0,
    syncedAt: 0,
    syncError: null,
    ...record,
  } as StoredRecord<T>;
}

export class LocalDataTable<T> {
  db: string;
  collection: string;

  constructor(db: string, collection: string) {
    this.db = db;
    this.collection = collection;
  }

  get prefix() {
    return `${this.db}.${this.collection}`;
  }

  async getOne(id: string): Promise<StoredRecord<T> | null> {
    try {
      const storageStr = localStorage.getItem(`${this.prefix}.${id}`);
      if (storageStr) {
        return withSyncDefaults(JSON.parse(storageStr) as T & { id: string });
      }
    } catch {}

    return null;
  }

  async getMany<Query = T>(q: IDataTableQuery<Query>) {
    const allItemIds = this.getAllItemUids();
    let idsToFetch: string[] = allItemIds;

    let cursor: number = 0;
    if (typeof q.cursor === 'number') cursor = q.cursor;
    else if (q.cursor && typeof q.cursor === 'string')
      cursor = idsToFetch.indexOf(q.cursor);

    let allItems = (await Promise.all(
      idsToFetch.map((id) => this.getOne(id))
    )) as StoredRecord<T>[];

    if (q.sort) {
      for (const [prop, order] of q.sort) {
        allItems = allItems.sort((a, b) => {
          const aValue = a[prop as unknown as keyof T];
          const bValue = b[prop as unknown as keyof T];

          if (aValue < bValue) return order === 'asc' ? -1 : 1;
          if (aValue > bValue) return order === 'asc' ? 1 : -1;
          return 0;
        });
      }
    }

    let filteredItems = allItems.filter((item) => {
      if (!item) return false;

      if (q.where) {
        let hasFoundTruth = false;
        for (const [prop, comparitor, value] of q.where) {
          const entryValue = item[prop as unknown as keyof T];

          if (comparitor === '==' && entryValue === value) hasFoundTruth = true;
          else if (comparitor === '!=' && entryValue !== value)
            hasFoundTruth = true;
          else if (comparitor === '<' && entryValue < value)
            hasFoundTruth = true;
          else if (comparitor === '<=' && entryValue <= value)
            hasFoundTruth = true;
          else if (comparitor === '>' && entryValue > value)
            hasFoundTruth = true;
          else if (comparitor === '>=' && entryValue >= value)
            hasFoundTruth = true;
          else return false;
        }

        if (!hasFoundTruth) return false;
      }

      return true;
    });

    let limit = q.limit || filteredItems.length;
    if (cursor + limit > filteredItems.length) {
      limit = filteredItems.length - cursor;
    }

    const slicedItems = filteredItems.slice(cursor, cursor + limit);

    return {
      items: slicedItems,
      cursor: filteredItems.length
        ? filteredItems.indexOf(slicedItems.at(-1)!) + 1
        : 0,
    };
  }

  async remove(id: string) {
    if (localStorage.getItem(`${this.prefix}.${id}`)) {
      localStorage.removeItem(`${this.prefix}.${id}`);

      const existingUids = this.getAllItemUids();
      existingUids.splice(existingUids.indexOf(id), 1);
      localStorage.setItem(this.prefix, JSON.stringify(existingUids));
      return true;
    }
    return false;
  }

  getAllItemUids() {
    let existingUids: string[] = [];
    try {
      existingUids = JSON.parse(localStorage.getItem(this.prefix) || '[]');
    } catch (e) {
      console.error(e);
    }

    return existingUids;
  }

  async add(token: T): Promise<StoredRecord<T>> {
    const newUid = generateUUID();
    const record: StoredRecord<T> = {
      ...token,
      id: newUid,
      updatedAt: Date.now(),
      syncedAt: 0,
      syncError: null,
    };
    localStorage.setItem(`${this.prefix}.${newUid}`, JSON.stringify(record));

    const existingUids = this.getAllItemUids();
    existingUids.push(newUid);
    localStorage.setItem(this.prefix, JSON.stringify(existingUids));

    return record;
  }

  async patch(id: string, token: Partial<T>): Promise<void> {
    const existing = await this.getOne(id);
    if (existing) {
      localStorage.setItem(
        `${this.prefix}.${id}`,
        JSON.stringify({ ...existing, ...token, updatedAt: Date.now() })
      );
    }
  }

  async getDirty(): Promise<StoredRecord<T>[]> {
    const allItemIds = this.getAllItemUids();
    const allItems = await Promise.all(allItemIds.map((id) => this.getOne(id)));
    const dirty: StoredRecord<T>[] = [];
    for (const item of allItems) {
      if (item !== null && item.updatedAt > item.syncedAt) dirty.push(item);
    }
    return dirty;
  }

  async markSynced(id: string, syncedAt: number, syncError: string | null): Promise<void> {
    const existing = await this.getOne(id);
    if (existing) {
      localStorage.setItem(
        `${this.prefix}.${id}`,
        JSON.stringify({ ...existing, syncedAt, syncError })
      );
    }
  }

  async putSynced(record: T & { id: string; updatedAt: number }, syncedAt: number): Promise<void> {
    const isNew = !localStorage.getItem(`${this.prefix}.${record.id}`);
    const stored: StoredRecord<T> = { ...record, syncedAt, syncError: null };
    localStorage.setItem(`${this.prefix}.${record.id}`, JSON.stringify(stored));
    if (isNew) {
      const existingUids = this.getAllItemUids();
      existingUids.push(record.id);
      localStorage.setItem(this.prefix, JSON.stringify(existingUids));
    }
  }
}
