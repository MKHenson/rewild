import { LocalDataTable } from './local-db';

describe('Local database tests', () => {
  function getLocalTable() {
    return new LocalDataTable<{
      type: string;
      smelly?: boolean;
      age?: number;
      name?: string;
    }>('rewild', 'animals');
  }

  it('correctly creates a valid prefix', () => {
    const table = getLocalTable();
    expect(table.prefix).toEqual('rewild.animals');
  });

  it('correctly gets 0 results for the table animals', async () => {
    const table = getLocalTable();
    const results = await table.getMany({});
    expect(results.items.length).toEqual(0);
  });

  it('correctly adds an item to the table', async () => {
    const local = getLocalTable();
    const newItem = await local.add({ age: 1, type: 'cat' });
    expect(newItem).toEqual({ id: expect.any(String), age: 1, type: 'cat' });

    const results = await local.getMany({});
    expect(results.items.length).toEqual(1);
    expect(results.items[0]).toEqual({ id: newItem.id, age: 1, type: 'cat' });
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
    });

    expect(rows.items.length).toEqual(6);
    expect(rows.items[0].name).toEqual('Gunther 0');
    expect(rows.items[5].name).toEqual('Gunther 5');

    rows = await local.getMany({
      where: [['type', '==', 'named cat']],
      limit: 2,
    });

    expect(rows.items.length).toEqual(2);
    expect(rows.items[0].name).toEqual('Gunther 0');
    expect(rows.items[1].name).toEqual('Gunther 1');

    rows = await local.getMany({
      where: [['type', '==', 'named cat']],
      limit: 2,
      cursor: rows.cursor,
    });

    expect(rows.items.length).toEqual(2);
    expect(rows.items[0].name).toEqual('Gunther 2');
    expect(rows.items[1].name).toEqual('Gunther 3');
    expect(rows.cursor).toEqual(4); // cursor should be 4

    rows = await local.getMany({
      where: [['type', '==', 'named cat']],
      limit: 2,
      cursor: rows.cursor,
    });
    expect(rows.items.length).toEqual(2);
    expect(rows.items[0].name).toEqual('Gunther 4');
    expect(rows.items[1].name).toEqual('Gunther 5');
    expect(rows.cursor).toEqual(6); // cursor should be 6

    rows = await local.getMany({
      where: [['type', '==', 'named cat']],
      limit: 2,
      cursor: rows.cursor,
    });
    expect(rows.items.length).toEqual(0); // no more items to fetch
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
    expect(rows.items[0].type).toEqual('mouse'); // first item should be 'mouse'
    expect(rows.items[1].type).toEqual('cat'); // second item should be 'cat'

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
});
