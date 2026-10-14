import 'rewild-ui/compiler/jsx';
import { Table } from 'rewild-ui';
import { ProjectSharingPanel } from './ProjectSharingPanel';
import { UserPicker } from '../../common/UserPicker';
import { authStore } from '../../../stores/AuthStore';
import { authService } from '../../../../api/auth/auth-service';

const flush = () => new Promise((r) => setTimeout(r, 0));

const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const share = (userId: string, displayName: string, createdAt = 1000) => ({
  userId,
  displayName,
  grantedBy: 'owner',
  grantedByName: 'Owner',
  createdAt,
});

async function createPanel(syncedAt: number) {
  const comp = new ProjectSharingPanel();
  comp._props = { project: { id: 'p1', name: 'Valley', syncedAt } } as never;
  comp._createRenderer();
  document.body.appendChild(comp);
  for (let i = 0; i < 4; i++) await flush();
  return comp;
}

const text = (comp: ProjectSharingPanel) => comp.shadow!.textContent ?? '';
const table = (comp: ProjectSharingPanel) => comp.shadow!.querySelector('x-table') as Table;
const rowText = (comp: ProjectSharingPanel) =>
  Array.from(table(comp).shadow!.querySelectorAll('tbody tr')).map((tr) => tr.textContent);
const picker = (comp: ProjectSharingPanel) => comp.shadow!.querySelector('x-user-picker') as UserPicker;

describe('ProjectSharingPanel', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    authStore.loggedIn = true;
    jest.spyOn(authService, 'getToken').mockReturnValue(null);
    fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.endsWith('/api/projects/p1/shares'))
        return json([share('u1', 'Ana')]);
      if (method === 'POST' && url.endsWith('/api/projects/p1/shares'))
        return json(share(JSON.parse(init!.body as string).userId, 'Ben', 2000));
      if (method === 'DELETE' && url.endsWith('/api/projects/p1/shares/u1')) return json(null, 204);
      return json(null, 404);
    });
    global.fetch = fetchMock as never;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    authStore.loggedIn = false;
    jest.restoreAllMocks();
  });

  it('tells logged out players to sign in', async () => {
    authStore.loggedIn = false;
    const comp = await createPanel(1000);

    expect(text(comp)).toContain('Sharing needs an account');
    expect(picker(comp)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains that a local only project cannot be shared yet', async () => {
    const comp = await createPanel(0);

    expect(text(comp)).toContain('only on this device');
    expect(picker(comp)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists the shares of a project saved on the server', async () => {
    const comp = await createPanel(1000);

    expect(rowText(comp)).toHaveLength(1);
    expect(rowText(comp)[0]).toContain('Ana');
    expect(rowText(comp)[0]).toContain('Owner');
  });

  it('adds the picked user to the top of the list', async () => {
    const comp = await createPanel(1000);

    picker(comp).props.onSelect({ id: 'u2', displayName: 'Ben' });
    for (let i = 0; i < 4; i++) await flush();

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(post[1].body)).toEqual({ userId: 'u2' });
    expect(rowText(comp).map((r) => r!.includes('Ben'))).toEqual([true, false]);
  });

  it('revokes a share', async () => {
    const comp = await createPanel(1000);

    const revoke = table(comp).shadow!.querySelector('x-button') as HTMLElement;
    revoke.click();
    for (let i = 0; i < 4; i++) await flush();

    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
    expect(table(comp).shadow!.textContent).toContain('not shared with anyone');
  });

  it("shows the server's reason when a share fails", async () => {
    const comp = await createPanel(1000);
    fetchMock.mockImplementationOnce(async () =>
      json({ error: 'This project is flagged and cannot be shared' }, 409)
    );

    picker(comp).props.onSelect({ id: 'u2', displayName: 'Ben' });
    for (let i = 0; i < 4; i++) await flush();

    expect(text(comp)).toContain('This project is flagged and cannot be shared');
    expect(rowText(comp)).toHaveLength(1);
  });
});
