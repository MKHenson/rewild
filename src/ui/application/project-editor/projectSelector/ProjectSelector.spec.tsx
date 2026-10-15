import 'rewild-ui/compiler/jsx';
import { Button, Card } from 'rewild-ui';
import { IProject, StoredRecord } from 'models';
import { ProjectSelector } from './ProjectSelector';
import { projectsStore } from '../../../stores/ProjectsStore';
import { authStore } from '../../../stores/AuthStore';
import { confirmationStore } from '../../../stores/ConfirmationStore';
import { db } from 'src/database/database';

const project = (
  id: string,
  token: Partial<StoredRecord<IProject>> = {}
): StoredRecord<IProject> =>
  ({
    id,
    name: `Project ${id}`,
    description: `About ${id}`,
    levelId: '',
    startEvent: '',
    sceneGraph: {},
    updatedAt: 1000,
    syncedAt: 0,
    ...token,
  }) as never;

const flush = () => new Promise((r) => setTimeout(r, 0));

function createSelector() {
  const onBack = jest.fn();
  const onOpen = jest.fn();
  const comp = new ProjectSelector();
  comp._props = { open: true, onBack, onOpen } as never;
  comp._createRenderer();
  document.body.appendChild(comp);
  return { comp, onBack, onOpen };
}

const text = (comp: ProjectSelector) => comp.shadow!.textContent ?? '';

const findButton = (comp: ProjectSelector, label: string) =>
  (Array.from(comp.shadow!.querySelectorAll('x-button')) as Button[]).find(
    (b) => b.textContent?.trim() === label
  );

async function clickButton(comp: ProjectSelector, label: string) {
  findButton(comp, label)!.props.onClick!(new MouseEvent('click'));
  await flush();
}

const projectCards = (comp: ProjectSelector) =>
  (Array.from(comp.shadow!.querySelectorAll('x-card')) as Card[]).filter((c) =>
    c.querySelector('.project-card')
  );

async function selectProject(comp: ProjectSelector, id: string) {
  const card = projectCards(comp).find((c) =>
    c.textContent?.includes(`Project ${id}`)
  )!;
  card.props.onClick!(new MouseEvent('click'));
  await flush();
}

describe('ProjectSelector', () => {
  let getProjects: jest.SpyInstance;

  beforeEach(() => {
    projectsStore.projects = [project('a'), project('b', { syncedAt: 500 })];
    projectsStore.loading = false;
    projectsStore.error = '';
    projectsStore.publicProjectId = null;
    authStore.loggedIn = false;
    getProjects = jest
      .spyOn(projectsStore, 'getProjects')
      .mockResolvedValue(undefined);
    jest.spyOn(db, 'getProjectImage').mockResolvedValue(null);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    confirmationStore.close();
    jest.restoreAllMocks();
  });

  it('loads the projects on mount and lists them', () => {
    const { comp } = createSelector();

    expect(getProjects).toHaveBeenCalled();
    expect(projectCards(comp).map((c) => c.textContent?.trim())).toEqual([
      'Project a',
      'Project b',
    ]);
  });

  it('shows a loader while loading and the error when loading fails', () => {
    projectsStore.loading = true;
    const { comp } = createSelector();
    expect(comp.shadow!.querySelector('x-loading')).not.toBeNull();
    expect(projectCards(comp)).toHaveLength(0);

    document.body.innerHTML = '';
    projectsStore.loading = false;
    projectsStore.error = 'Offline';
    const { comp: failed } = createSelector();
    expect(text(failed)).toContain('Offline');
  });

  it('shows the details of the selected project and opens it', async () => {
    const { comp, onOpen } = createSelector();
    expect(findButton(comp, 'Open')).toBeUndefined();

    await selectProject(comp, 'a');

    expect(text(comp)).toContain('About a');
    expect(projectCards(comp)[0].props.pushed).toBe(true);
    await clickButton(comp, 'Open');
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  describe('delete', () => {
    it('is offered for a local only project when logged out', async () => {
      const { comp } = createSelector();
      await selectProject(comp, 'a');
      expect(findButton(comp, 'Delete')).toBeDefined();
    });

    it('is hidden for a project saved on the server when logged out', async () => {
      const { comp } = createSelector();
      await selectProject(comp, 'b');
      expect(findButton(comp, 'Delete')).toBeUndefined();
    });

    it('is offered for a project saved on the server when logged in', async () => {
      authStore.loggedIn = true;
      const { comp } = createSelector();
      await selectProject(comp, 'b');
      expect(findButton(comp, 'Delete')).toBeDefined();
    });

    it('is disabled for the public game, with the reason', async () => {
      authStore.loggedIn = true;
      projectsStore.publicProjectId = 'b';
      const { comp } = createSelector();

      await selectProject(comp, 'b');

      expect(findButton(comp, 'Delete')!.props.disabled).toBe(true);
      expect(text(comp)).toContain('This is the public game');
    });

    it('asks first, then deletes and clears the selection', async () => {
      const deleteProject = jest
        .spyOn(projectsStore, 'deleteProject')
        .mockResolvedValue(true);
      const { comp } = createSelector();
      await selectProject(comp, 'a');

      await clickButton(comp, 'Delete');
      expect(confirmationStore.open).toBe(true);
      expect(confirmationStore.message).toContain('"Project a"');
      expect(deleteProject).not.toHaveBeenCalled();

      confirmationStore.confirm();
      await flush();

      expect(deleteProject).toHaveBeenCalledWith('a');
      expect(findButton(comp, 'Open')).toBeUndefined();
    });

    it('keeps the selection when the delete fails', async () => {
      jest.spyOn(projectsStore, 'deleteProject').mockResolvedValue(false);
      const { comp } = createSelector();
      await selectProject(comp, 'a');

      await clickButton(comp, 'Delete');
      confirmationStore.confirm();
      await flush();

      expect(findButton(comp, 'Open')).toBeDefined();
    });
  });

  describe('new project', () => {
    const openForm = async (comp: ProjectSelector) => {
      const newCard = (
        Array.from(comp.shadow!.querySelectorAll('x-card')) as Card[]
      ).find((c) => c.textContent?.includes('New Project'))!;
      newCard.props.onClick!(new MouseEvent('click'));
      await flush();
    };

    it('replaces the list with the form and clears the selection', async () => {
      const { comp } = createSelector();
      await selectProject(comp, 'a');

      await openForm(comp);

      expect(comp.shadow!.querySelector('x-new-project-form')).not.toBeNull();
      expect(projectCards(comp)).toHaveLength(0);
      expect(findButton(comp, 'Open')).toBeUndefined();
      expect(findButton(comp, 'Create Project')).toBeDefined();
    });

    it('creates the project and returns to the list', async () => {
      const addProject = jest
        .spyOn(projectsStore, 'addProject')
        .mockResolvedValue(undefined);
      const { comp } = createSelector();
      await openForm(comp);

      await clickButton(comp, 'Create Project');

      expect(addProject).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Project' })
      );
      expect(comp.shadow!.querySelector('x-new-project-form')).toBeNull();
    });

    it('disables Create while the name is empty', async () => {
      const { comp } = createSelector();
      await openForm(comp);

      const form = comp.shadow!.querySelector('x-new-project-form') as any;
      form.props.onChange({ name: '' });
      comp.render();

      expect(findButton(comp, 'Create Project')!.props.disabled).toBe(true);
    });

    it('Back closes the form before it leaves the selector', async () => {
      const { comp, onBack } = createSelector();
      await openForm(comp);

      await clickButton(comp, 'Back');
      expect(comp.shadow!.querySelector('x-new-project-form')).toBeNull();
      expect(onBack).not.toHaveBeenCalled();

      await clickButton(comp, 'Back');
      expect(onBack).toHaveBeenCalled();
    });
  });
});
