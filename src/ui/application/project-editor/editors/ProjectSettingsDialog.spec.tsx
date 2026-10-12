import 'rewild-ui/compiler/jsx';
import { Input, Modal, Select } from 'rewild-ui';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';
import { projectStore } from '../../../stores/ProjectStore';
import { db } from 'src/database/database';

const LEVELS = [
  { id: 'level-1', name: 'Valley', projectId: 'p1' },
  { id: 'level-2', name: '', projectId: 'p1' },
];

function createDialog(onClose = jest.fn()) {
  const comp = new ProjectSettingsDialog();
  comp._props = { onClose } as never;
  comp._createRenderer();
  document.body.appendChild(comp);
  return { comp, onClose };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const getInputs = (comp: ProjectSettingsDialog) =>
  Array.from(comp.shadow!.querySelectorAll('x-input')) as Input[];

const getSelect = (comp: ProjectSettingsDialog) =>
  comp.shadow!.querySelector('x-select') as Select;

function clickButton(comp: ProjectSettingsDialog, label: string) {
  const modal = comp.shadow!.querySelector('x-modal') as Modal;
  const button = Array.from(modal.shadow!.querySelectorAll('x-button')).find(
    (b) => b.textContent?.trim() === label
  ) as HTMLElement;
  button.click();
}

describe('ProjectSettingsDialog', () => {
  let updateProject: jest.SpyInstance;

  beforeEach(() => {
    projectStore.project = {
      id: 'p1',
      name: 'Old name',
      description: 'Old description',
      startEvent: '',
      levelId: 'level-1',
      updatedAt: 1000,
      sceneGraph: {},
    } as never;
    updateProject = jest
      .spyOn(projectStore, 'updateProject')
      .mockResolvedValue(undefined);
    jest
      .spyOn(db.levels, 'getMany')
      .mockResolvedValue({ items: LEVELS, cursor: 0 } as never);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    projectStore.project = null;
    jest.restoreAllMocks();
  });

  it('fills the fields from the project', () => {
    const { comp } = createDialog();
    const [name, description] = getInputs(comp);
    expect(name.props.value).toBe('Old name');
    expect(description.props.value).toBe('Old description');
    expect(getSelect(comp).props.value).toBe('level-1');
  });

  it("lists the project's levels as start levels", async () => {
    const { comp } = createDialog();
    await flush();
    expect(getSelect(comp).props.options).toEqual([
      { value: 'level-1', label: 'Valley' },
      { value: 'level-2', label: 'Untitled Level' },
    ]);
  });

  it('saves the name, description and start level', async () => {
    const { comp, onClose } = createDialog();
    await flush();
    const [name, description] = getInputs(comp);
    name.props.onChange!('New name');
    description.props.onChange!('New description');
    getSelect(comp).props.onChange!('level-2');

    clickButton(comp, 'Save');
    await flush();

    expect(projectStore.project).toMatchObject({
      name: 'New name',
      description: 'New description',
      levelId: 'level-2',
    });
    expect(updateProject).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('disables the buttons and stays open until the save ends', async () => {
    let finish: () => void = () => undefined;
    updateProject.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve))
    );
    const { comp, onClose } = createDialog();

    clickButton(comp, 'Save');
    await flush();

    const modal = comp.shadow!.querySelector('x-modal') as Modal;
    expect(modal.props.okDisabled).toBe(true);
    expect(modal.props.cancelDisabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    finish();
    await flush();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog open and shows an error for an empty name', async () => {
    const { comp, onClose } = createDialog();
    getInputs(comp)[0].props.onInput!('   ');

    clickButton(comp, 'Save');
    await flush();

    expect(updateProject).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(comp.shadow!.querySelector('.error')?.textContent).toBe(
      'Enter a name for the project'
    );
  });

  it('clears the name error once a name is typed', async () => {
    const { comp } = createDialog();
    getInputs(comp)[0].props.onInput!('');
    clickButton(comp, 'Save');
    await flush();

    getInputs(comp)[0].props.onInput!('Named');
    await flush();

    expect(comp.shadow!.querySelector('.error')).toBeNull();
  });

  it('closes on cancel after a failed save', async () => {
    const { comp, onClose } = createDialog();
    getInputs(comp)[0].props.onInput!('');
    clickButton(comp, 'Save');
    await flush();

    clickButton(comp, 'Cancel');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('changes nothing on cancel', async () => {
    const { comp, onClose } = createDialog();
    getInputs(comp)[0].props.onChange!('New name');

    clickButton(comp, 'Cancel');

    expect(projectStore.project!.name).toBe('Old name');
    expect(updateProject).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
