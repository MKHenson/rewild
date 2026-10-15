import 'rewild-ui/compiler/jsx';
import { Button, Table, TablePagination } from 'rewild-ui';
import { ProjectList } from './ProjectList';
import { authService } from '../../../api/auth/auth-service';
import { confirmationStore } from '../../stores/ConfirmationStore';
import { db } from 'src/database/database';

const project = (id: string, flaggedAt: number | null = null) => ({
  id,
  name: `Project ${id}`,
  description: '',
  imageUrl: null,
  authorId: 'u1',
  authorName: 'Ann',
  updatedAt: 1,
  flaggedAt,
});

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

async function createList() {
  const onRun = jest.fn();
  const comp = new ProjectList();
  comp._props = { onRun } as never;
  comp._createRenderer();
  document.body.appendChild(comp);
  await flush();
  return { comp, onRun };
}

const rows = (comp: ProjectList) =>
  Array.from(
    (comp.shadow!.querySelector('x-table') as Table).shadow!.querySelectorAll('tbody tr')
  );

const rowButton = (comp: ProjectList, row: number, label: string) =>
  (Array.from(rows(comp)[row].querySelectorAll('x-button')) as Button[]).find(
    (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label
  )!;

const pagination = (comp: ProjectList) =>
  comp.shadow!.querySelector('x-table-pagination') as TablePagination;

describe('ProjectList', () => {
  let requests: { url: string; method: string }[];
  let items: ReturnType<typeof project>[];
  let total: number;

  beforeEach(() => {
    requests = [];
    items = [project('a'), project('b', 5)];
    total = 2;
    jest.spyOn(authService, 'getToken').mockReturnValue(null);
    jest.spyOn(db, 'getProjectImage').mockResolvedValue(null);
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, method: init?.method ?? 'GET' });
      if (url.includes('/flag')) return json(null, 204);
      return json({ items, total });
    }) as never;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    confirmationStore.close();
    jest.restoreAllMocks();
  });

  it('loads the first page, newest first, and shows the flag state', async () => {
    const { comp } = await createList();

    expect(requests[0].url).toContain('/api/admin/projects?page=0&pageSize=25');
    expect((comp.shadow!.querySelector('x-table') as Table).props.sort).toBeNull();
    expect(rows(comp).map((r) => r.textContent)).toEqual([
      expect.stringContaining('Active'),
      expect.stringContaining('Flagged'),
    ]);
    expect(rowButton(comp, 0, 'Flag project')).toBeDefined();
    expect(rowButton(comp, 1, 'Unflag project')).toBeDefined();
    expect((rowButton(comp, 0, 'Flag project').querySelector('x-icon') as any).props.icon).toBe('flag');
    expect((rowButton(comp, 1, 'Unflag project').querySelector('x-icon') as any).props.icon).toBe('flag-off');
    expect(rowButton(comp, 0, 'Flag project').title).toBe('Flag project');
  });

  it('styles the cells inside the table', async () => {
    const { comp } = await createList();
    const css = (comp.shadow!.querySelector('x-table') as Table).props.css;

    expect(css).toContain('.row-actions');
    expect(css).toContain('x-project-image');
  });

  it('runs a project', async () => {
    const { comp, onRun } = await createList();

    rowButton(comp, 0, 'Run').props.onClick!(new MouseEvent('click'));

    expect(onRun).toHaveBeenCalledWith('a');
  });

  it('flags a project only after the confirm, then reloads', async () => {
    const { comp } = await createList();

    rowButton(comp, 0, 'Flag project').props.onClick!(new MouseEvent('click'));
    expect(confirmationStore.open).toBe(true);
    expect(requests.some((r) => r.method === 'POST')).toBe(false);

    items = [project('a', 9), project('b', 5)];
    confirmationStore.confirm();
    await flush();

    expect(requests).toContainEqual({ url: expect.stringContaining('/api/projects/a/flag'), method: 'POST' });
    expect(rowButton(comp, 0, 'Unflag project')).toBeDefined();
  });

  it('unflags a project after the confirm', async () => {
    const { comp } = await createList();

    rowButton(comp, 1, 'Unflag project').props.onClick!(new MouseEvent('click'));
    confirmationStore.confirm();
    await flush();

    expect(requests).toContainEqual({ url: expect.stringContaining('/api/projects/b/flag'), method: 'DELETE' });
  });

  it('pages through the projects', async () => {
    total = 60;
    const { comp } = await createList();
    expect(pagination(comp).props).toMatchObject({ count: 60, page: 0, rowsPerPage: 25 });

    pagination(comp).props.onPageChange(1);
    await flush();

    expect(requests.at(-1)!.url).toContain('page=1&pageSize=25');
    expect(pagination(comp).props.page).toBe(1);
  });

  it('a new page size starts again from the first page', async () => {
    total = 60;
    const { comp } = await createList();
    pagination(comp).props.onPageChange(2);
    await flush();

    pagination(comp).props.onRowsPerPageChange!(10);
    await flush();

    expect(requests.at(-1)!.url).toContain('page=0&pageSize=10');
    expect(pagination(comp).props).toMatchObject({ page: 0, rowsPerPage: 10 });
  });

  it('a new sort starts again from the first page', async () => {
    total = 60;
    const { comp } = await createList();
    pagination(comp).props.onPageChange(1);
    await flush();

    (comp.shadow!.querySelector('x-table') as Table).props.onSortChange!({ key: 'flagged', direction: 'desc' });
    await flush();

    expect(requests.at(-1)!.url).toContain('sort=flagged&order=desc&page=0');
    expect((comp.shadow!.querySelector('x-table') as Table).props.sort).toEqual({ key: 'flagged', direction: 'desc' });
  });

  it('clicking a header cycles its sort: ascending, descending, then the default order', async () => {
    const { comp } = await createList();
    const nameHeader = () =>
      (comp.shadow!.querySelector('x-table') as Table).shadow!.querySelectorAll('th')[1].querySelector('button')!;

    nameHeader().click();
    await flush();
    expect(requests.at(-1)!.url).toContain('sort=name&order=asc');

    nameHeader().click();
    await flush();
    expect(requests.at(-1)!.url).toContain('sort=name&order=desc');

    nameHeader().click();
    await flush();
    expect(requests.at(-1)!.url).not.toContain('sort=');
  });
});
