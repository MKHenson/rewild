import { IDataTable, IDataTableQuery } from 'models';
import { generateUUID } from 'rewild-common';

export class LocalDataTable<T> implements IDataTable<T> {
  db: string;
  collection: string;

  constructor(db: string, collection: string) {
    this.db = db;
    this.collection = collection;
  }

  get prefix() {
    return `${this.db}.${this.collection}`;
  }

  async getOne(id: string) {
    try {
      const storageStr = localStorage.getItem(`${this.prefix}.${id}`);
      if (storageStr) {
        return JSON.parse(storageStr) as T & { id: string };
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
    )) as (T & { id: string })[];

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

  async add(token: T) {
    const newUid = generateUUID();
    const tokenWithId = { ...token, id: newUid };
    localStorage.setItem(
      `${this.prefix}.${newUid}`,
      JSON.stringify(tokenWithId)
    );

    const existingUids = this.getAllItemUids();
    existingUids.push(newUid);
    localStorage.setItem(this.prefix, JSON.stringify(existingUids));

    return tokenWithId;
  }

  async patch(id: string, token: Partial<T>): Promise<void> {
    const existing = await this.getOne(id);
    if (existing) {
      localStorage.addItem(
        `${this.prefix}.${id}`,
        JSON.stringify({ ...existing, ...token })
      );
    }
  }
}
