import 'rewild-ui/compiler/jsx';
import { navigate, Select } from 'rewild-ui';
import { AdminPage } from './AdminPage';
import { PublicGamePanel } from './PublicGamePanel';
import { adminStore } from '../../stores/AdminStore';
import { authStore } from '../../stores/AuthStore';
import { authService } from '../../../api/auth/auth-service';
import { db } from 'src/database/database';

const PROJECTS = [
  { id: 'p1', name: 'Valley', description: '', imageUrl: null, authorId: 'u1', authorName: 'Ann', updatedAt: 2 },
  { id: 'p2', name: 'Coast', description: '', imageUrl: null, authorId: 'u2', authorName: 'Bo', updatedAt: 1 },
];

const flush = () => new Promise((r) => setTimeout(r, 0));

function createPage() {
  const comp = new AdminPage();
  comp._props = { onClose: jest.fn() } as never;
  comp._createRenderer();
  document.body.appendChild(comp);
  return comp;
}

const panel = (comp: AdminPage) =>
  comp.shadow!.querySelector('x-admin-public-game') as PublicGamePanel | null;

const panelSelect = (comp: AdminPage) =>
  panel(comp)!.shadow!.querySelector('x-select') as Select;

describe('AdminPage', () => {
  beforeEach(() => {
    authStore.loggedIn = true;
    authStore.user = { ...authStore.user, role: 'super_admin' } as never;
    jest.spyOn(adminStore, 'fetchUsers').mockResolvedValue();
    jest.spyOn(authService, 'getToken').mockReturnValue(null);
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith('/api/admin/projects')
          ? PROJECTS
          : { id: 'p1', name: 'Valley', description: '', imageUrl: null },
    })) as never;
    jest.spyOn(db, 'getPendingProjectImage').mockResolvedValue(null);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
    jest.restoreAllMocks();
  });

  it('mounts the Public tab only on its route, so a return starts from the saved game', async () => {
    navigate('/admin/public');
    const comp = createPage();
    await flush();
    await flush();

    panelSelect(comp).props.onChange!('p2');
    await flush();
    expect(panelSelect(comp).value).toBe('p2');

    navigate('/admin');
    await flush();
    expect(panel(comp)).toBeNull();

    navigate('/admin/public');
    await flush();
    await flush();
    expect(panelSelect(comp).value).toBe('p1');
  });
});
