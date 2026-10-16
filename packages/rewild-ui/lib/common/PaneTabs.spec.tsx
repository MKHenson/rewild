import '../../compiler/jsx';
import { PaneTabs } from './PaneTabs';
import { fireClick, flushMicrotasks } from '../test-utils';

describe('PaneTabs', () => {
  function createPaneTabs() {
    const first = (<div id="first" />) as HTMLElement;
    const second = (<div id="second" />) as HTMLElement;
    const element = (
      <PaneTabs
        tabs={[
          { title: 'Actors', content: first },
          { title: 'Levels', content: second },
        ]}
      />
    ) as PaneTabs;
    element.render();
    return { element, first, second };
  }

  const buttonsOf = (element: PaneTabs) =>
    Array.from(element.shadow!.querySelectorAll('.tab')) as HTMLButtonElement[];

  const isShown = (content: HTMLElement) =>
    !content.parentElement!.hasAttribute('hidden');

  it('renders a tab per pane and shows the first', () => {
    const { element, first, second } = createPaneTabs();

    expect(buttonsOf(element).map((b) => b.textContent)).toEqual([
      'Actors',
      'Levels',
    ]);
    expect(buttonsOf(element)[0].getAttribute('aria-selected')).toBe('true');
    expect(isShown(first)).toBe(true);
    expect(isShown(second)).toBe(false);
  });

  it('switches pane on a tab click and keeps the hidden pane mounted', async () => {
    const { element, first, second } = createPaneTabs();

    fireClick(buttonsOf(element)[1]);
    await flushMicrotasks();

    expect(buttonsOf(element)[1].getAttribute('aria-selected')).toBe('true');
    expect(isShown(second)).toBe(true);
    expect(isShown(first)).toBe(false);
    expect(element.shadow!.contains(first)).toBe(true);
  });
});
