import '../../compiler/jsx';
import { TablePagination, TablePaginationProps } from './TablePagination';

function renderPagination(props: Partial<TablePaginationProps>) {
  const onPageChange = jest.fn();
  const onRowsPerPageChange = jest.fn();
  const comp = new TablePagination({
    props: { count: 13, page: 0, rowsPerPage: 5, rowsPerPageOptions: [5, 10, 25], onPageChange, onRowsPerPageChange, ...props },
  });
  comp._createRenderer();
  comp.render();
  const arrows = comp.shadow!.querySelectorAll('button.arrow');
  return {
    comp,
    onPageChange,
    onRowsPerPageChange,
    range: () => comp.shadow!.querySelector('.range')!.textContent,
    prev: arrows[0] as HTMLButtonElement,
    next: arrows[1] as HTMLButtonElement,
    select: comp.shadow!.querySelector('select') as HTMLSelectElement | null,
  };
}

describe('TablePagination', () => {
  it('shows the range of the first page and only Next enabled', () => {
    const { range, prev, next } = renderPagination({});
    expect(range()).toBe('1–5 of 13');
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
  });

  it('caps the range on the last page and disables Next', () => {
    const { range, prev, next } = renderPagination({ page: 2 });
    expect(range()).toBe('11–13 of 13');
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(true);
  });

  it('shows 0–0 and disables both arrows when there are no rows', () => {
    const { range, prev, next } = renderPagination({ count: 0 });
    expect(range()).toBe('0–0 of 0');
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);
  });

  it('says "more than" when the count is unknown', () => {
    const { range, next } = renderPagination({ count: -1, page: 1 });
    expect(range()).toBe('6–10 of more than 10');
    expect(next.disabled).toBe(false);
  });

  it('asks for the previous and next page', () => {
    const { prev, next, onPageChange } = renderPagination({ page: 1 });
    prev.click();
    next.click();
    expect(onPageChange.mock.calls).toEqual([[0], [2]]);
  });

  it('offers the rows per page options and reports a change', () => {
    const { select, onRowsPerPageChange } = renderPagination({});
    expect(Array.from(select!.options).map((o) => o.value)).toEqual(['5', '10', '25']);
    expect(select!.value).toBe('5');

    select!.value = '25';
    select!.dispatchEvent(new Event('change'));
    expect(onRowsPerPageChange).toHaveBeenCalledWith(25);
  });

  it('hides the rows per page select with fewer than two options', () => {
    const { select } = renderPagination({ rowsPerPageOptions: [25] });
    expect(select).toBeNull();
  });

  it('disables every control while disabled', () => {
    const { select, prev, next } = renderPagination({ page: 1, disabled: true });
    expect(select!.disabled).toBe(true);
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);
  });
});
