import 'rewild-ui/compiler/jsx';
import { RibbonButtons } from './RibbonButtons';
import { projectStore } from '../../../stores/ProjectStore';
import { sculptStore } from '../../../stores/SculptStore';
import { db } from 'src/database/database';

function buttonsOf(ribbon: RibbonButtons): HTMLElement[] {
  return Array.from(ribbon.shadow!.querySelectorAll('x-button'));
}

const SETTINGS = 1;
const SAVE = 2;
const PLAY = 3;
const SCULPT = 5;

describe('RibbonButtons', () => {
  beforeEach(() => {
    projectStore.loading = false;
    projectStore.dirty = false;
    projectStore.project = {} as any;
    projectStore.level = { sceneGraph: { terrain: {} } } as any;
  });

  afterEach(() => {
    sculptStore.setEnabled(false);
    document.body.replaceChildren();
  });

  function createRibbon(): RibbonButtons {
    const ribbon = (<RibbonButtons onHome={jest.fn()} />) as RibbonButtons;
    document.body.appendChild(ribbon);
    return ribbon;
  }

  // A press that itself changes the project, such as a property field saving
  // on blur, must not swap the button out between mousedown and mouseup.
  it('keeps the same buttons when the project changes', () => {
    const ribbon = createRibbon();
    const before = buttonsOf(ribbon);

    projectStore.dirty = true;
    projectStore.dispatcher.dispatch({ kind: 'changed' });

    const after = buttonsOf(ribbon);
    expect(after).toHaveLength(before.length);
    after.forEach((button, i) => expect(button).toBe(before[i]));
  });

  it('enables save once the project has changes', () => {
    const ribbon = createRibbon();
    expect(buttonsOf(ribbon)[SAVE].hasAttribute('disabled')).toBe(true);

    projectStore.dirty = true;
    projectStore.dispatcher.dispatch({ kind: 'changed' });

    expect(buttonsOf(ribbon)[SAVE].hasAttribute('disabled')).toBe(false);
  });

  it('disables the terrain tools without terrain', () => {
    projectStore.level = { sceneGraph: {} } as any;
    const ribbon = createRibbon();

    for (const button of buttonsOf(ribbon).slice(PLAY + 1))
      expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('opens the project settings', async () => {
    jest
      .spyOn(db.levels, 'getMany')
      .mockResolvedValue({ items: [], cursor: 0 } as never);
    projectStore.project = { id: 'p1', name: 'P' } as any;
    const ribbon = createRibbon();

    buttonsOf(ribbon)[SETTINGS].click();
    await new Promise((r) => setTimeout(r, 0));

    expect(
      ribbon.shadow!.querySelector('x-project-settings-dialog')
    ).not.toBeNull();
  });

  it('plays the open project', async () => {
    projectStore.project = { id: 'p1' } as any;
    const ribbon = createRibbon();

    buttonsOf(ribbon)[PLAY].click();
    await Promise.resolve();

    expect(window.location.pathname).toBe('/game/p1');
  });

  it('marks the armed brush, in place', () => {
    const ribbon = createRibbon();
    const sculpt = buttonsOf(ribbon)[SCULPT];

    sculptStore.setEnabled(true);

    expect(buttonsOf(ribbon)[SCULPT]).toBe(sculpt);
    expect(sculpt.classList.contains('sculpt-active')).toBe(true);
  });
});
