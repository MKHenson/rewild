import 'rewild-ui/compiler/jsx';
import { Table, TablePagination } from 'rewild-ui';
import { UserList } from './UserList';
import { adminStore } from '../../stores/AdminStore';

const user = (n: number) => ({
  id: `u${n}`,
  email: `u${n}@test.com`,
  displayName: `User ${n}`,
  role: 'user',
  photoUrl: null,
  hasPassword: true,
  hasGoogle: false,
  projectCount: 0,
  createdAt: 1,
});

const flush = () => new Promise((r) => setTimeout(r, 0));

function createList() {
  const comp = new UserList();
  comp._props = { onSelect: jest.fn() } as never;
  comp._createRenderer();
  document.body.appendChild(comp);
  return comp;
}

const names = (comp: UserList) =>
  Array.from(
    (comp.shadow!.querySelector('x-table') as Table).shadow!.querySelectorAll('tbody tr')
  ).map((tr) => tr.querySelectorAll('td')[1].textContent);

const pagination = (comp: UserList) =>
  comp.shadow!.querySelector('x-table-pagination') as TablePagination;

describe('UserList', () => {
  beforeEach(() => {
    jest.spyOn(adminStore, 'fetchUsers').mockResolvedValue();
    adminStore.users = Array.from({ length: 30 }, (_, i) => user(i + 1));
    adminStore.loading = false;
    adminStore.error = undefined;
    adminStore.usersPage = 0;
    adminStore.usersPerPage = 25;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('shows the first page of users', () => {
    const comp = createList();

    expect(names(comp)).toHaveLength(25);
    expect(names(comp)[0]).toBe('User 1');
    expect(pagination(comp).props).toMatchObject({ count: 30, page: 0, rowsPerPage: 25 });
  });

  it('moves to the next page', async () => {
    const comp = createList();

    pagination(comp).props.onPageChange(1);
    await flush();

    expect(names(comp)).toEqual(['User 26', 'User 27', 'User 28', 'User 29', 'User 30']);
  });

  it('a new page size starts again from the first page', async () => {
    const comp = createList();
    pagination(comp).props.onPageChange(1);
    await flush();

    pagination(comp).props.onRowsPerPageChange!(10);
    await flush();

    expect(names(comp)).toHaveLength(10);
    expect(names(comp)[0]).toBe('User 1');
  });

  it('keeps the page after a visit to a user', async () => {
    const comp = createList();
    pagination(comp).props.onPageChange(1);
    await flush();
    comp.remove();

    const again = createList();

    expect(names(again)[0]).toBe('User 26');
  });

  it('falls back to the last page when fewer users remain', () => {
    adminStore.usersPage = 1;
    adminStore.users = adminStore.users.slice(0, 20);

    const comp = createList();

    expect(names(comp)[0]).toBe('User 1');
    expect(pagination(comp).props.page).toBe(0);
  });
});
