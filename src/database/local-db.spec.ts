import { LocalDataTable, withSyncDefaults } from './local-db';

describe('Local database tests', () => {
  function getLocalTable() {
    return new LocalDataTable<{
      type: string;
      smelly?: boolean;
      age?: number;
      name?: string;
    }>('rewild', 'projects');
  }

  it('correctly creates a valid prefix', () => {
    const table = getLocalTable();
    expect(table.prefix).toEqual('rewild.projects');
  });

  it('correctly gets 0 results for the table', async () => {
    const table = getLocalTable();
    const results = await table.getMany({});
    expect(results.items.length).toEqual(0);
  });

  it('correctly adds an item to the table', async () => {
    const local = getLocalTable();
    const newItem = await local.add({ age: 1, type: 'cat' });
    expect(newItem).toEqual(
      expect.objectContaining({ id: expect.any(String), age: 1, type: 'cat' })
    );

    const results = await local.getMany({});
    expect(results.items.length).toEqual(1);
    expect(results.items[0]).toEqual(
      expect.objectContaining({ id: newItem.id, age: 1, type: 'cat' })
    );
  });

  it('correctly adds multiple items to the table and has persisted value from previous test', async () => {
    const local = getLocalTable();

    for (let i = 0; i < 10; i++) {
      await local.add({ age: i, type: 'cat ' + i });
    }

    const rows = await local.getMany({});
    expect(rows.items.length).toEqual(11); // 1 from previous test + 10 new ones
  });

  it('gets all rows based on an equality query', async () => {
    const local = getLocalTable();

    for (let i = 0; i < 10; i++) {
      await local.add({ age: i, type: 'cat 1', smelly: i % 2 === 0 });
    }

    const rows = await local.getMany({
      where: [['smelly', '==', true]],
    });
    expect(rows.items.length).toEqual(5); // 5 rows with smelly = true
    expect(rows.cursor).toEqual(5); // cursor should be 5
  });

  it('gets the correct index and pagination cursor', async () => {
    const local = getLocalTable();

    for (let i = 0; i < 6; i++) {
      await local.add({ name: 'Gunther ' + i, type: 'named cat' });
    }

    for (let i = 0; i < 6; i++) {
      await local.add({ name: 'Axel ' + i, type: 'named dog' });
    }

    let rows = await local.getMany({
      where: [['type', '==', 'named cat']],
      sort: [['name', 'asc']],
    });

    expect(rows.items.length).toEqual(6);
    expect(rows.items[0].name).toEqual('Gunther 0');
    expect(rows.items[5].name).toEqual('Gunther 5');

    rows = await local.getMany({
      where: [['type', '==', 'named cat']],
      sort: [['name', 'asc']],
      limit: 2,
    });

    expect(rows.items.length).toEqual(2);
    expect(rows.items[0].name).toEqual('Gunther 0');
    expect(rows.items[1].name).toEqual('Gunther 1');

    rows = await local.getMany({
      where: [['type', '==', 'named cat']],
      sort: [['name', 'asc']],
      limit: 2,
      cursor: rows.cursor,
    });

    expect(rows.items.length).toEqual(2);
    expect(rows.items[0].name).toEqual('Gunther 2');
    expect(rows.items[1].name).toEqual('Gunther 3');
    expect(rows.cursor).toEqual(4);

    rows = await local.getMany({
      where: [['type', '==', 'named cat']],
      sort: [['name', 'asc']],
      limit: 2,
      cursor: rows.cursor,
    });
    expect(rows.items.length).toEqual(2);
    expect(rows.items[0].name).toEqual('Gunther 4');
    expect(rows.items[1].name).toEqual('Gunther 5');
    expect(rows.cursor).toEqual(6);

    rows = await local.getMany({
      where: [['type', '==', 'named cat']],
      sort: [['name', 'asc']],
      limit: 2,
      cursor: rows.cursor,
    });
    expect(rows.items.length).toEqual(0);
  });

  it('gets nothing when the cursor is out of bounds', async () => {
    const local = getLocalTable();

    for (let i = 0; i < 10; i++) {
      await local.add({ name: 'Tom ' + i, type: 'data cat' });
    }

    const rows = await local.getMany({
      limit: 20,
      cursor: 1000000, // out of bounds cursor
    });

    expect(rows.items.length).toEqual(0); // no items to fetch
  });

  it('gets the total items when the limit is 0', async () => {
    const local = getLocalTable();

    for (let i = 0; i < 10; i++) {
      await local.add({ name: 'Tom ' + i, type: 'data cat' });
    }

    let rows = await local.getMany({});
    const totalItems = rows.items.length;

    rows = await local.getMany({
      limit: 0, // no limit
      cursor: 0, // start from the beginning
    });
    expect(rows.items.length).toEqual(totalItems); // all items should be returned
  });

  it('gets items using AND logic for multiple where clauses', async () => {
    const local = getLocalTable();
    await local.add({ name: 'jerry', type: 'mouse' });
    await local.add({ name: 'jerry', type: 'cat' });

    let rows = await local.getMany({
      where: [['name', '==', 'jerry']],
    });

    expect(rows.items.length).toEqual(2); // 2 items with name = 'jerry'
    expect(rows.items.map((i) => i.type).sort()).toEqual(['cat', 'mouse']);

    rows = await local.getMany({
      where: [
        ['name', '==', 'jerry'],
        ['type', '==', 'cat'],
      ],
    });

    expect(rows.items.length).toEqual(1); // 1 item with name = 'jerry' and type = 'cat'
    expect(rows.items[0].type).toEqual('cat'); // item should be 'cat'
  });

  it('gets 1 item when we are at the last page and the limit is greater than the number of items', async () => {
    const local = getLocalTable();

    for (let i = 0; i < 10; i++) {
      await local.add({ name: 'Tom ' + i, type: 'data cat' });
    }

    let allRows = await local.getMany({
      cursor: 0,
    });

    expect(allRows.items.length).toBeGreaterThan(0);

    let rows = await local.getMany({
      limit: 10,
      cursor: allRows.cursor - 1,
    });

    expect(rows.items.length).toEqual(1);
    expect(rows.items[0]).toStrictEqual(allRows.items.at(-1));
    expect(rows.cursor).toEqual(allRows.items.length);
  });

  describe('sync tracking fields', () => {
    it('sets updatedAt, syncedAt=0, syncError=null on add', async () => {
      const local = getLocalTable();
      const before = Date.now();
      const item = await local.add({ type: 'sync-cat' });
      const after = Date.now();

      expect(item.updatedAt).toBeGreaterThanOrEqual(before);
      expect(item.updatedAt).toBeLessThanOrEqual(after);
      expect(item.syncedAt).toBe(0);
      expect(item.syncError).toBeNull();
    });

    it('updates updatedAt on patch', async () => {
      const local = getLocalTable();
      const item = await local.add({ type: 'patch-cat' });
      const originalUpdatedAt = item.updatedAt;

      await new Promise((r) => setTimeout(r, 5));
      await local.patch(item.id, { type: 'patched-cat' });

      const updated = await local.getOne(item.id);
      expect(updated!.updatedAt).toBeGreaterThan(originalUpdatedAt);
      expect(updated!.type).toBe('patched-cat');
    });

    it('preserves syncedAt and syncError across patch', async () => {
      const local = getLocalTable();
      const item = await local.add({ type: 'sync-preserve-cat' });

      await local.patch(item.id, { syncedAt: 9999, syncError: 'timeout' } as any);
      const patched = await local.getOne(item.id);

      expect(patched!.syncedAt).toBe(9999);
      expect(patched!.syncError).toBe('timeout');
    });

    it('applies sync field defaults to records missing those fields', () => {
      const raw = { id: 'some-id', type: 'legacy-cat' } as any;
      const result = withSyncDefaults(raw);
      expect(result.updatedAt).toBe(0);
      expect(result.syncedAt).toBe(0);
      expect(result.syncError).toBeNull();
      expect(result.deletedAt).toBeNull();
      expect(result.type).toBe('legacy-cat');
    });

    it('sets deletedAt: null on add', async () => {
      const local = getLocalTable();
      const item = await local.add({ type: 'new-cat' });
      expect(item.deletedAt).toBeNull();
    });

    it('getDirty returns records where updatedAt > syncedAt', async () => {
      const local = getLocalTable();
      const item1 = await local.add({ type: 'dirty-cat' });
      const item2 = await local.add({ type: 'dirty-cat' });

      // markSynced sets syncedAt without bumping updatedAt, so item2 becomes clean
      await local.markSynced(item2.id, item2.updatedAt, null);

      const dirty = await local.getDirty();
      const dirtyIds = dirty.map((d) => d.id);

      expect(dirtyIds).toContain(item1.id);
      expect(dirtyIds).not.toContain(item2.id);
    });

    it('records with updatedAt=0 and syncedAt=0 are not dirty', () => {
      const item = withSyncDefaults({ id: 'clean-001', type: 'clean-cat' } as any);
      expect(item.updatedAt).toBe(0);
      expect(item.syncedAt).toBe(0);
      expect(item.updatedAt > item.syncedAt).toBe(false);
    });

    it('markSynced updates syncedAt and syncError without bumping updatedAt', async () => {
      const local = getLocalTable();
      const item = await local.add({ type: 'mark-synced-cat' });

      await local.markSynced(item.id, 12345, null);
      const updated = await local.getOne(item.id);

      expect(updated!.syncedAt).toBe(12345);
      expect(updated!.syncError).toBeNull();
      expect(updated!.updatedAt).toBe(item.updatedAt);
    });

    it('markSynced stores a syncError when provided', async () => {
      const local = getLocalTable();
      const item = await local.add({ type: 'error-cat' });

      await local.markSynced(item.id, 99999, 'network timeout');
      const updated = await local.getOne(item.id);

      expect(updated!.syncError).toBe('network timeout');
      expect(updated!.syncedAt).toBe(99999);
    });

    it('putSynced inserts a new record with syncedAt set', async () => {
      const local = getLocalTable();
      const record = { id: 'server-id-001', type: 'server-cat', updatedAt: 5000 } as any;

      await local.putSynced(record, 5000);
      const stored = await local.getOne('server-id-001');

      expect(stored).not.toBeNull();
      expect(stored!.syncedAt).toBe(5000);
      expect(stored!.syncError).toBeNull();
      expect(stored!.type).toBe('server-cat');
    });

    it('putSynced overwrites an existing record', async () => {
      const local = getLocalTable();
      const item = await local.add({ type: 'overwrite-cat' });

      await local.putSynced({ ...item, type: 'updated-cat' }, 99999);
      const stored = await local.getOne(item.id);

      expect(stored!.type).toBe('updated-cat');
      expect(stored!.syncedAt).toBe(99999);
    });
  });

  it('can sort items', async () => {
    const local = getLocalTable();

    for (let i = 0; i < 4; i++) {
      await local.add({ name: 'Cleo ' + i, type: 'sorted cat', age: i });
    }

    let allRows = await local.getMany({
      where: [['type', '==', 'sorted cat']],
      sort: [['age', 'asc']],
    });

    expect(allRows.items.length).toEqual(4);
    expect(allRows.items[0].name).toEqual('Cleo 0');
    expect(allRows.items[1].name).toEqual('Cleo 1');
    expect(allRows.items[2].name).toEqual('Cleo 2');
    expect(allRows.items[3].name).toEqual('Cleo 3');
    expect(allRows.cursor).toEqual(4); // cursor should be 4

    allRows = await local.getMany({
      where: [['type', '==', 'sorted cat']],
      sort: [['age', 'desc']],
    });

    expect(allRows.items.length).toEqual(4);
    expect(allRows.items[0].name).toEqual('Cleo 3');
    expect(allRows.items[1].name).toEqual('Cleo 2');
    expect(allRows.items[2].name).toEqual('Cleo 1');
    expect(allRows.items[3].name).toEqual('Cleo 0');
    expect(allRows.cursor).toEqual(4); // cursor should be 4

    allRows = await local.getMany({
      where: [['type', '==', 'sorted cat']],
      sort: [['age', 'desc']],
      cursor: 3,
    });

    expect(allRows.items.length).toEqual(1);
    expect(allRows.items[0].name).toEqual('Cleo 0');
  });

  it('remove returns false for a non-existent id', async () => {
    const local = getLocalTable();
    const result = await local.remove('does-not-exist');
    expect(result).toBe(false);
  });

  it('remove soft-deletes the item: getOne returns null but record is kept as a tombstone', async () => {
    const local = getLocalTable();
    const item = await local.add({ type: 'remove-cat' });

    const removed = await local.remove(item.id);
    expect(removed).toBe(true);

    const fetched = await local.getOne(item.id);
    expect(fetched).toBeNull();
  });

  describe('soft delete (tombstoning)', () => {
    it('remove sets deletedAt and bumps updatedAt so the tombstone is dirty', async () => {
      const local = getLocalTable();
      const item = await local.add({ type: 'dirty-tombstone-cat' });
      await local.markSynced(item.id, item.updatedAt, null); // make it clean

      const before = Date.now();
      await local.remove(item.id);

      const dirty = await local.getDirty();
      const tombstone = dirty.find((r) => r.id === item.id);
      expect(tombstone).toBeDefined();
      expect(tombstone!.deletedAt).toBeGreaterThanOrEqual(before);
      expect(tombstone!.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('getMany excludes tombstoned records', async () => {
      const local = getLocalTable();
      const live = await local.add({ type: 'tombstone-visible-cat' });
      const deleted = await local.add({ type: 'tombstone-visible-cat' });
      await local.remove(deleted.id);

      const rows = await local.getMany({ where: [['type', '==', 'tombstone-visible-cat']] });
      const ids = rows.items.map((i) => i.id);
      expect(ids).toContain(live.id);
      expect(ids).not.toContain(deleted.id);
    });

    it('getDirty includes tombstoned records so they are pushed to the server', async () => {
      const local = getLocalTable();
      const item = await local.add({ type: 'sync-tombstone-cat' });
      await local.markSynced(item.id, item.updatedAt, null); // clean
      await local.remove(item.id); // soft delete — dirty again

      const dirty = await local.getDirty();
      expect(dirty.map((r) => r.id)).toContain(item.id);
    });

    it('hardRemove physically deletes the record so getDirty does not include it', async () => {
      const local = getLocalTable();
      const item = await local.add({ type: 'hard-remove-cat' });

      await local.hardRemove(item.id);

      const dirty = await local.getDirty();
      expect(dirty.map((r) => r.id)).not.toContain(item.id);
    });

    it('hardRemove on a non-existent id is a no-op', async () => {
      const local = getLocalTable();
      await expect(local.hardRemove('does-not-exist')).resolves.toBeUndefined();
    });

    it('putSynced preserves deletedAt from incoming record, hiding it from getOne', async () => {
      const local = getLocalTable();
      const deletedAt = Date.now();
      await local.putSynced(
        { id: 'srv-tombstone', type: 'server-deleted-cat', updatedAt: 5000, deletedAt } as any,
        5000
      );

      // getOne returns null because deletedAt is set on the stored record
      const result = await local.getOne('srv-tombstone');
      expect(result).toBeNull();
    });

    it('putSynced defaults deletedAt to null when the incoming record has none', async () => {
      const local = getLocalTable();
      await local.putSynced(
        { id: 'srv-live', type: 'server-live-cat', updatedAt: 5000 } as any,
        5000
      );

      const result = await local.getOne('srv-live');
      expect(result).not.toBeNull();
      expect(result!.deletedAt).toBeNull();
    });
  });
});
