import '../../compiler/jsx';
import { Table, TableColumn, TableProps } from './Table';

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
});
