import 'rewild-ui/compiler/jsx';
import { Button, Select } from 'rewild-ui';
import { PublicGamePanel } from './PublicGamePanel';
import { authService } from '../../../api/auth/auth-service';
import { db } from 'src/database/database';

const PROJECTS = [
  {
    id: 'p1',
    name: 'Valley',
    description: 'About p1',
    imageUrl: null,
    authorId: 'u1',
    authorName: 'Ann',
    updatedAt: 2,
  },
  {
    id: 'p2',
    name: 'Coast',
    description: 'About p2',
    imageUrl: null,
    authorId: 'u2',
    authorName: 'Bo',
    updatedAt: 1,
  },
];

const FLAGGED = { ...PROJECTS[0], id: 'p3', name: 'Blocked', flaggedAt: 5 };

const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const noContent = () => ({ ok: true, status: 204, json: async () => null });

const summary = (id: string) => ({
  id,
  name: PROJECTS.find((p) => p.id === id)!.name,
  description: `About ${id}`,
  imageUrl: null,
});

const flush = () => new Promise((r) => setTimeout(r, 0));

async function createPanel() {
  const comp = new PublicGamePanel();
  comp._createRenderer();
  document.body.appendChild(comp);
  await flush();
  await flush();
  return comp;
}

const getSelect = (comp: PublicGamePanel) =>
  comp.shadow!.querySelector('x-select') as Select;

const getSave = (comp: PublicGamePanel) =>
  comp.shadow!.querySelector('[slot="actions"] x-button') as Button;

describe('PublicGamePanel', () => {
  let fetchMock: jest.Mock;
  let putBodies: unknown[];
  let publicId: string | null;

  beforeEach(() => {
    putBodies = [];
    publicId = 'p1';
    jest.spyOn(authService, 'getToken').mockReturnValue(null);
    jest.spyOn(db, 'getPendingProjectImage').mockResolvedValue(null);
    fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/projects'))
        return json({ items: [...PROJECTS, FLAGGED], total: 3 });
      if (init?.method === 'PUT') {
        const body = JSON.parse(init.body as string);
        putBodies.push(body);
        if (body.projectId === 'p2') return json({ error: 'Nope' }, 400);
        publicId = body.projectId;
      }
      return publicId ? json(summary(publicId)) : noContent();
    });
    global.fetch = fetchMock as never;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('preselects the public game and lists every unflagged project with its author', async () => {
    const comp = await createPanel();
    const select = getSelect(comp);

    expect(select.value).toBe('p1');
    expect(select.props.options.map((o) => o.label)).toEqual([
      'None',
      'Valley (Ann)',
      'Coast (Bo)',
    ]);
    expect(getSave(comp).props.disabled).toBe(true);
    expect(comp.shadow!.textContent).toContain('About p1');
  });

  it('previews the selected project before it is saved', async () => {
    const comp = await createPanel();

    getSelect(comp).props.onChange!('p2');
    await flush();

    expect(comp.shadow!.textContent).toContain('About p2');
    expect(comp.shadow!.textContent).toContain('by Bo');
    expect(putBodies).toEqual([]);
  });

  it('clears the promotion', async () => {
    const comp = await createPanel();

    getSelect(comp).props.onChange!('');
    await flush();
    expect(getSave(comp).props.disabled).toBe(false);
    getSave(comp).props.onClick!(new MouseEvent('click'));
    await flush();
    await flush();

    expect(putBodies).toEqual([{ projectId: null }]);
    expect(comp.shadow!.textContent).toContain('Saved');
    expect(comp.shadow!.textContent).toContain('No public game');
    expect(getSave(comp).props.disabled).toBe(true);
  });

  it('shows the server error when the save is rejected', async () => {
    const comp = await createPanel();

    getSelect(comp).props.onChange!('p2');
    await flush();
    getSave(comp).props.onClick!(new MouseEvent('click'));
    await flush();
    await flush();

    expect(putBodies).toEqual([{ projectId: 'p2' }]);
    expect(comp.shadow!.textContent).toContain('Nope');
    expect(getSelect(comp).value).toBe('p2');
  });
});
