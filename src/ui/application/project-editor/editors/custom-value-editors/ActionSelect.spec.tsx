import 'rewild-ui/compiler/jsx';
import { Select } from 'rewild-ui';
import { ActionSelect } from './ActionSelect';
import { sceneGraphStore } from 'src/ui/stores/SceneGraphStore';

const resource = (id: string, name: string, type: string) => ({
  id,
  name,
  type,
});

const NODES = [
  {
    name: 'Containers',
    children: [
      {
        name: 'Caves',
        resource: resource('c1', 'Caves', 'container'),
        children: [
          { name: 'Portal', resource: resource('p1', 'Portal', 'portal') },
          { name: 'Rock', resource: resource('a1', 'Rock', 'actor') },
        ],
      },
      {
        name: 'Summit',
        resource: resource('c2', 'Summit', 'container'),
        children: [
          { name: 'Portal', resource: resource('p2', 'Portal', 'portal') },
        ],
      },
    ],
  },
];

function createSelect(props: Partial<ActionSelect['props']> = {}) {
  const comp = new ActionSelect();
  comp._props = props as never;
  comp._createRenderer();
  document.body.appendChild(comp);
  return comp;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const getSelects = (comp: ActionSelect) =>
  Array.from(comp.shadow!.querySelectorAll('x-select')) as Select[];

const getError = (comp: ActionSelect) =>
  comp.shadow!.querySelector('.action-error')?.textContent ?? null;

describe('ActionSelect', () => {
  beforeEach(() => {
    sceneGraphStore.nodes = NODES as never;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    sceneGraphStore.nodes = [];
  });

  it('lists None and each asset with actions, in every container', () => {
    const [target] = getSelects(createSelect());
    expect(target.props.options).toEqual([
      { value: '', label: 'None' },
      { value: 'p1', label: 'Portal (Caves)' },
      { value: 'p2', label: 'Portal (Summit)' },
    ]);
  });

  it('has no actions to pick until a target is chosen', () => {
    const [, action] = getSelects(createSelect());
    expect(action.props.options).toEqual([{ value: '', label: 'None' }]);
    expect(action.props.disabled).toBe(true);
  });

  it("lists a portal's actions once it is the target", () => {
    const comp = createSelect({ value: { target: 'p1', action: '' } });
    const [, action] = getSelects(comp);
    expect(action.props.options).toEqual([
      { value: '', label: 'None' },
      { value: 'unlock', label: 'Unlock' },
      { value: 'lock', label: 'Lock' },
      { value: 'toggle', label: 'Toggle' },
    ]);
    expect(action.props.disabled).toBe(false);
  });

  it('clears the action when the target changes', () => {
    const onChange = jest.fn();
    const comp = createSelect({
      value: { target: 'p1', action: 'unlock' },
      onChange,
    });
    getSelects(comp)[0].props.onChange!('p2');
    expect(onChange).toHaveBeenCalledWith({ target: 'p2', action: '' });
  });

  it('reports the target and the picked action as one value', () => {
    const onChange = jest.fn();
    const comp = createSelect({
      value: { target: 'p1', action: '' },
      onChange,
    });
    getSelects(comp)[1].props.onChange!('unlock');
    expect(onChange).toHaveBeenCalledWith({ target: 'p1', action: 'unlock' });
  });

  it('shows no error when empty or complete', () => {
    expect(getError(createSelect())).toBeNull();
    expect(
      getError(createSelect({ value: { target: 'p1', action: 'lock' } }))
    ).toBeNull();
  });

  it('shows an error for a target with no action', () => {
    const comp = createSelect({ value: { target: 'p1', action: '' } });
    expect(getError(comp)).toBe('Choose an action');
  });

  it('shows an error for a target that is gone', () => {
    const comp = createSelect({ value: { target: 'gone', action: 'unlock' } });
    expect(getError(comp)).toBe('The target is not in the level');
  });

  it('is disabled when read-only', () => {
    const comp = createSelect({
      readOnly: true,
      value: { target: 'p1', action: 'unlock' },
    });
    for (const select of getSelects(comp))
      expect(select.props.disabled).toBe(true);
  });

  it('updates when the scene graph changes', async () => {
    const comp = createSelect();
    NODES[0].children[1].children[0].resource.name = 'Exit';
    sceneGraphStore.dispatcher.dispatch({
      kind: 'nodes-updated',
      nodes: sceneGraphStore.nodes,
    });
    await flush();
    expect(getSelects(comp)[0].props.options).toContainEqual({
      value: 'p2',
      label: 'Exit (Summit)',
    });
    NODES[0].children[1].children[0].resource.name = 'Portal';
  });
});
