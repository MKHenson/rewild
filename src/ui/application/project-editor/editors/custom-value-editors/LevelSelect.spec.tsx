import 'rewild-ui/compiler/jsx';
import { Select } from 'rewild-ui';
import { LevelSelect } from './LevelSelect';
import { levelsStore } from 'src/ui/stores/LevelsStore';
import { projectStore } from 'src/ui/stores/ProjectStore';

const LEVELS = [
  { id: 'level-1', name: 'Present', projectId: 'p1' },
  { id: 'level-2', name: 'Past', projectId: 'p1' },
  { id: 'level-3', name: 'Future', projectId: 'p1' },
];

function createSelect(props: Partial<LevelSelect['props']> = {}) {
  const comp = new LevelSelect();
  comp._props = props as never;
  comp._createRenderer();
  document.body.appendChild(comp);
  return comp;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const getSelect = (comp: LevelSelect) =>
  comp.shadow!.querySelector('x-select') as Select;

describe('LevelSelect', () => {
  beforeEach(() => {
    levelsStore.levels = LEVELS as never;
    projectStore.level = LEVELS[0] as never;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    levelsStore.levels = [];
    projectStore.level = null;
  });

  it('lists None and every level but the open one', () => {
    const comp = createSelect();
    expect(getSelect(comp).props.options).toEqual([
      { value: '', label: 'None' },
      { value: 'level-2', label: 'Past' },
      { value: 'level-3', label: 'Future' },
    ]);
  });

  it('shows the chosen level', () => {
    const comp = createSelect({ value: 'level-3' });
    expect(getSelect(comp).props.value).toBe('level-3');
  });

  it('shows None when no level is chosen', () => {
    const comp = createSelect();
    expect(getSelect(comp).props.value).toBe('');
  });

  it('reports the picked level', () => {
    const onChange = jest.fn();
    const comp = createSelect({ onChange });
    getSelect(comp).props.onChange!('level-2');
    expect(onChange).toHaveBeenCalledWith('level-2');
  });

  it('is disabled when read-only', () => {
    const comp = createSelect({ readOnly: true });
    expect(getSelect(comp).props.disabled).toBe(true);
  });

  it('updates when the levels change', async () => {
    const comp = createSelect();
    levelsStore.levels = [
      ...LEVELS,
      { id: 'level-4', name: 'Ice Age', projectId: 'p1' },
    ] as never;
    levelsStore.dispatcher.dispatch({ kind: 'changed' });
    await flush();
    expect(getSelect(comp).props.options).toContainEqual({
      value: 'level-4',
      label: 'Ice Age',
    });
  });
});
