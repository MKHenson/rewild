import 'rewild-ui/compiler/jsx';
import { ILevel, IProject } from 'models';
import { Table } from 'rewild-ui';
import { MyGamesPanel } from './MyGamesPanel';
import { authStore } from '../../stores/AuthStore';
import { authService } from '../../../api/auth/auth-service';
import { db } from 'src/database/database';
import { clearDatabase } from 'src/database/local-db';
import { emptySceneGraph } from 'src/test-utils';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function addProject(name: string, updatedAt: number, levelNames: string[] = []) {
  const project = await db.projects.add({ name, description: `About ${name}`, } as unknown as IProject);
  const levels = [];
  for (const levelName of levelNames)
    levels.push(await db.levels.add({ name: levelName, projectId: project.id, hasTerrain: true, startEvent: '', sceneGraph: emptySceneGraph() } as ILevel));
  await db.projects.putSynced({ ...project, levelId: levels[0]?.id, updatedAt }, 0);
  return project.id;
}

async function createPanel() {
  const onSelect = jest.fn();
  const comp = new MyGamesPanel();
  comp._props = { onSelect } as never;
  comp._createRenderer();
  document.body.appendChild(comp);
  for (let i = 0; i < 4; i++) await flush();
  return { comp, onSelect };
}

const table = (comp: MyGamesPanel) => comp.shadow!.querySelector('x-table') as Table;
const rowNames = (comp: MyGamesPanel) =>
  Array.from(table(comp).shadow!.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')!.textContent);
const filterButton = (comp: MyGamesPanel, label: string) =>
  Array.from(comp.shadow!.querySelectorAll('x-button')).find((b) => b.textContent?.trim() === label) as HTMLElement;

const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const details = (comp: MyGamesPanel) => comp.shadow!.querySelector('.details')!.textContent ?? '';

describe('MyGamesPanel', () => {
  beforeEach(async () => {
    await clearDatabase('rewild');
    authStore.loggedIn = false;
    jest.spyOn(authService, 'getToken').mockReturnValue(null);
    jest.spyOn(db, 'getProjectImage').mockResolvedValue(null);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('lists the projects newest first and selects the newest', async () => {
    await addProject('Old', 1000);
    const newest = await addProject('New', 3000, ['Valley', 'Coast']);
    await addProject('Middle', 2000);

    const { comp, onSelect } = await createPanel();

    expect(rowNames(comp)).toEqual(['New', 'Middle', 'Old']);
    expect(onSelect).toHaveBeenLastCalledWith(newest);
    expect(details(comp)).toContain('About New');
    expect(details(comp)).toContain('Valley · start level');
    expect(details(comp)).toContain('Coast');
    expect(details(comp)).toContain('Only on this device');
    expect(details(comp)).toContain('You');
  });

  it('selects the row the player clicks', async () => {
    await addProject('New', 3000);
    const old = await addProject('Old', 1000, ['Cave']);
    const { comp, onSelect } = await createPanel();

    const rows = table(comp).shadow!.querySelectorAll('tbody tr');
    (rows[1] as HTMLElement).click();
    for (let i = 0; i < 4; i++) await flush();

    expect(onSelect).toHaveBeenLastCalledWith(old);
    expect(details(comp)).toContain('Cave · start level');
    expect(table(comp).shadow!.querySelectorAll('tbody tr')[1].classList.contains('selected')).toBe(true);
  });

  it('shows the logged in player as the author', async () => {
    authStore.loggedIn = true;
    authStore.user = { ...authStore.user, displayName: 'Mat' };
    await addProject('Mine', 1000);

    const { comp } = await createPanel();

    expect(details(comp)).toContain('Mat');
  });

  it('shows no filter to logged out players', async () => {
    const { comp } = await createPanel();

    expect(comp.shadow!.querySelector('x-button-group')).toBeNull();
  });

  it('lists the games shared with a logged in player', async () => {
    authStore.loggedIn = true;
    await addProject('Mine', 1000);
    const fetchMock = jest.fn(async (url: string) => {
      if (url.endsWith('/api/projects?scope=shared'))
        return json([
          { id: 's2', name: 'Newer Share', description: 'From a friend', authorName: 'Ana', updatedAt: 2000 },
          { id: 's1', name: 'Older Share', description: '', authorName: 'Ben', updatedAt: 1000 },
        ]);
      if (url.endsWith('/api/play/s2')) return json({ project: {}, levels: [{ id: 'l1', name: 'Fjord' }], assets: [] });
      return json(null, 404);
    });
    global.fetch = fetchMock as never;

    const { comp, onSelect } = await createPanel();
    expect(rowNames(comp)).toEqual(['Mine']);

    filterButton(comp, 'Shared Games').click();
    for (let i = 0; i < 6; i++) await flush();

    expect(rowNames(comp)).toEqual(['Newer Share', 'Older Share']);
    expect(onSelect).toHaveBeenLastCalledWith('s2');
    expect(details(comp)).toContain('Ana');
    expect(details(comp)).toContain('Fjord');
    expect(details(comp)).not.toContain('Saved to your account');

    filterButton(comp, 'My Games').click();
    for (let i = 0; i < 6; i++) await flush();

    expect(rowNames(comp)).toEqual(['Mine']);
  });

  it('shows why the levels of a blocked shared game cannot load', async () => {
    authStore.loggedIn = true;
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/api/projects?scope=shared'))
        return json([{ id: 's1', name: 'Blocked', description: '', authorName: 'Ana', updatedAt: 1000 }]);
      return json({ error: 'This game is not available' }, 403);
    }) as never;

    const { comp } = await createPanel();
    filterButton(comp, 'Shared Games').click();
    for (let i = 0; i < 6; i++) await flush();

    expect(details(comp)).toContain('This game is not available');
  });

  it('selects nothing when there are no projects', async () => {
    const { comp, onSelect } = await createPanel();

    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(table(comp).shadow!.textContent).toContain('You have no games yet');
    expect(comp.shadow!.querySelector('.panel')!.classList.contains('no-details')).toBe(true);
    expect(comp.shadow!.querySelector('.details')).toBeNull();
  });
});
