import '../../compiler/jsx';
import { nextSort, Table, TableColumn, TableProps } from './Table';

type Row = { id: string; name: string };

const columns: TableColumn<Row>[] = [
  { label: 'ID', width: '80px', render: (row) => row.id },
  { label: 'Name', render: (row) => row.name },
];

function renderTable(props: Partial<TableProps<Row>>) {
  const table = new Table<Row>({ props: { columns, rows: [], ...props } });
  table._createRenderer();
  table.render();
  return table;
}

describe('Table', () => {
  it('renders a header cell per column and a row per item', () => {
    const table = renderTable({
      rows: [
        { id: '1', name: 'Ada' },
        { id: '2', name: 'Grace' },
      ],
    });

    const headers = table.shadow!.querySelectorAll('th');
    expect(Array.from(headers).map((th) => th.textContent)).toEqual([
      'ID',
      'Name',
    ]);
    const rows = table.shadow!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[1].textContent).toBe('2Grace');
  });

  it('applies column widths', () => {
    const table = renderTable({});
    const cols = table.shadow!.querySelectorAll('col');
    expect((cols[0] as HTMLElement).style.width).toBe('80px');
    expect((cols[1] as HTMLElement).style.width).toBe('');
  });

  it('shows the empty message when there are no rows', () => {
    const table = renderTable({ emptyMessage: 'No users' });
    expect(table.shadow!.querySelector('tr.message')?.textContent).toBe(
      'No users'
    );
  });

  it('shows a loader instead of rows while loading', () => {
    const table = renderTable({
      rows: [{ id: '1', name: 'Ada' }],
      loading: true,
    });
    expect(table.shadow!.querySelector('tr.message x-loading')).not.toBeNull();
  });

  it('calls onRowClick on click and on Enter', () => {
    const onRowClick = jest.fn();
    const row = { id: '1', name: 'Ada' };
    const table = renderTable({ rows: [row], onRowClick });

    const tr = table.shadow!.querySelector('tbody tr') as HTMLElement;
    expect(tr.classList.contains('clickable')).toBe(true);
    tr.click();
    tr.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(onRowClick).toHaveBeenCalledWith(row);
  });

  it('leaves rows inert without onRowClick', () => {
    const table = renderTable({ rows: [{ id: '1', name: 'Ada' }] });
    const tr = table.shadow!.querySelector('tbody tr') as HTMLElement;
    expect(tr.classList.contains('clickable')).toBe(false);
  });

  describe('sorting', () => {
    const sortable: TableColumn<Row>[] = [
      { label: 'ID', render: (row) => row.id },
      { label: 'Name', sortKey: 'name', render: (row) => row.name },
    ];

    const headers = (table: Table<Row>) => table.shadow!.querySelectorAll('th');

    it('makes only columns with a sortKey clickable', () => {
      const table = renderTable({ columns: sortable });
      expect(headers(table)[0].querySelector('button')).toBeNull();
      expect(headers(table)[1].querySelector('button.sort')).not.toBeNull();
      expect(headers(table)[1].getAttribute('aria-sort')).toBe('none');
    });

    it('marks the sorted column and its direction', () => {
      const asc = renderTable({ columns: sortable, sort: { key: 'name', direction: 'asc' } });
      const desc = renderTable({ columns: sortable, sort: { key: 'name', direction: 'desc' } });

      expect(headers(asc)[1].getAttribute('aria-sort')).toBe('ascending');
      expect(headers(asc)[1].querySelector('button')!.classList.contains('active')).toBe(true);
      expect((headers(asc)[1].querySelector('x-icon') as any).props.icon).toBe('chevron-up');
      expect(headers(desc)[1].getAttribute('aria-sort')).toBe('descending');
      expect((headers(desc)[1].querySelector('x-icon') as any).props.icon).toBe('chevron-down');
    });

    it('reports the next sort on a header click', () => {
      const onSortChange = jest.fn();
      const table = renderTable({ columns: sortable, sort: { key: 'name', direction: 'asc' }, onSortChange });

      (headers(table)[1].querySelector('button') as HTMLButtonElement).click();

      expect(onSortChange).toHaveBeenCalledWith({ key: 'name', direction: 'desc' });
    });

    it('cycles ascending, descending, then off', () => {
      expect(nextSort(null, 'name')).toEqual({ key: 'name', direction: 'asc' });
      expect(nextSort({ key: 'name', direction: 'asc' }, 'name')).toEqual({ key: 'name', direction: 'desc' });
      expect(nextSort({ key: 'name', direction: 'desc' }, 'name')).toBeNull();
      expect(nextSort({ key: 'age', direction: 'desc' }, 'name')).toEqual({ key: 'name', direction: 'asc' });
    });
  });

  it('marks the rows isSelected picks', () => {
    const table = renderTable({
      rows: [
        { id: '1', name: 'Ada' },
        { id: '2', name: 'Grace' },
      ],
      isSelected: (row) => row.id === '2',
    });
    const rows = table.shadow!.querySelectorAll('tbody tr');
    expect(rows[0].classList.contains('selected')).toBe(false);
    expect(rows[0].getAttribute('aria-selected')).toBe('false');
    expect(rows[1].classList.contains('selected')).toBe(true);
    expect(rows[1].getAttribute('aria-selected')).toBe('true');
  });
});
