import '../../compiler/jsx';
import { Tab, Tabs } from './Tabs';
import { fireClick, flushMicrotasks } from '../test-utils';

type TabsOptions = NonNullable<ConstructorParameters<typeof Tabs>[0]>;
type TabsProps = TabsOptions['props'];

describe('Tabs', () => {
  function createTabs(props: TabsProps = {}, labels = ['One', 'Two', 'Three']) {
    const tabs = labels.map(
      (label) => (<Tab label={label}>{`${label} content`}</Tab>) as Tab
    );
    const element = (<Tabs {...props}>{tabs}</Tabs>) as Tabs;
    element.render();
    return { element, tabs };
  }

  const buttonsOf = (element: Tabs) =>
    Array.from(
      element.shadow!.querySelectorAll('.tab-button')
    ) as HTMLButtonElement[];

  const keyDown = (element: Tabs, key: string) =>
    fireKey(element.shadow!.querySelector('.tab-list')!, key);

  async function fireKey(target: Element, key: string) {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    );
    await flushMicrotasks();
  }

  it('renders one button per Tab child, labelled from it', () => {
    const { element } = createTabs();

    expect(buttonsOf(element).map((b) => b.textContent)).toEqual([
      'One',
      'Two',
      'Three',
    ]);
  });

  it('ignores children that are not Tabs', () => {
    const element = (
      <Tabs>
        <Tab label="One">a</Tab>
        <div>not a tab</div>
      </Tabs>
    ) as Tabs;
    element.render();

    expect(buttonsOf(element).length).toBe(1);
  });

  it('opens the first tab by default', () => {
    const { element, tabs } = createTabs();

    expect(tabs.map((t) => t.hasAttribute('active'))).toEqual([
      true,
      false,
      false,
    ]);
    expect(buttonsOf(element)[0].getAttribute('aria-selected')).toBe('true');
  });

  it('opens the tab whose button is clicked', async () => {
    const { element, tabs } = createTabs();

    await fireClick(buttonsOf(element)[1]);

    expect(tabs.map((t) => t.hasAttribute('active'))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('reports the new index through onChange', async () => {
    const onChange = jest.fn();
    const { element } = createTabs({ onChange });

    await fireClick(buttonsOf(element)[2]);

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('keeps every pane mounted so their state survives a switch', async () => {
    const { element, tabs } = createTabs();

    await fireClick(buttonsOf(element)[1]);

    expect(tabs[0].isConnected || tabs[0].parentElement).toBeTruthy();
    expect(tabs[0].textContent).toContain('One content');
  });

  it('marks a disabled Tab’s button disabled', () => {
    const element = (
      <Tabs>
        <Tab label="One">a</Tab>
        <Tab label="Two" disabled>
          b
        </Tab>
      </Tabs>
    ) as Tabs;
    element.render();

    expect(buttonsOf(element).map((b) => b.disabled)).toEqual([false, true]);
  });

  describe('orientation', () => {
    it('defaults to horizontal', () => {
      const { element } = createTabs();
      expect(element.getAttribute('orientation')).toBe('horizontal');
    });

    it('reflects vertical to an attribute for the stylesheet', () => {
      const { element } = createTabs({ orientation: 'vertical' });
      expect(element.getAttribute('orientation')).toBe('vertical');
    });
  });

  describe('when controlled', () => {
    it('opens the tab at activeIndex', () => {
      const { tabs } = createTabs({ activeIndex: 2 });

      expect(tabs[2].hasAttribute('active')).toBe(true);
    });

    // Otherwise the internal index and the owner's could disagree, and the
    // selection would jump the next time the owner re-rendered.
    it('does not move itself on a click, only reports it', async () => {
      const onChange = jest.fn();
      const { element, tabs } = createTabs({ activeIndex: 0, onChange });

      await fireClick(buttonsOf(element)[1]);

      expect(onChange).toHaveBeenCalledWith(1);
      expect(tabs[0].hasAttribute('active')).toBe(true);
      expect(tabs[1].hasAttribute('active')).toBe(false);
    });

    it('clamps an index past the end', () => {
      const { tabs } = createTabs({ activeIndex: 99 });

      expect(tabs[2].hasAttribute('active')).toBe(true);
    });
  });

  describe('keyboard navigation', () => {
    it('moves along the row with the horizontal arrows', async () => {
      const { element, tabs } = createTabs();

      await keyDown(element, 'ArrowRight');

      expect(tabs[1].hasAttribute('active')).toBe(true);

      await keyDown(element, 'ArrowLeft');

      expect(tabs[0].hasAttribute('active')).toBe(true);
    });

    it('wraps around the ends', async () => {
      const { element, tabs } = createTabs();

      await keyDown(element, 'ArrowLeft');

      expect(tabs[2].hasAttribute('active')).toBe(true);
    });

    it('moves down the column with the vertical arrows', async () => {
      const { element, tabs } = createTabs({ orientation: 'vertical' });

      await keyDown(element, 'ArrowDown');

      expect(tabs[1].hasAttribute('active')).toBe(true);
    });

    // The arrows have to follow the axis the tabs are laid out on, or a row of
    // tabs responds to a key that means nothing there.
    it('ignores the off-axis arrows', async () => {
      const { element, tabs } = createTabs();

      await keyDown(element, 'ArrowDown');

      expect(tabs[0].hasAttribute('active')).toBe(true);
    });

    it('jumps to the first and last tabs with Home and End', async () => {
      const { element, tabs } = createTabs();

      await keyDown(element, 'End');
      expect(tabs[2].hasAttribute('active')).toBe(true);

      await keyDown(element, 'Home');
      expect(tabs[0].hasAttribute('active')).toBe(true);
    });

    it('skips disabled tabs', async () => {
      const element = (
        <Tabs>
          <Tab label="One">a</Tab>
          <Tab label="Two" disabled>
            b
          </Tab>
          <Tab label="Three">c</Tab>
        </Tabs>
      ) as Tabs;
      element.render();

      await keyDown(element, 'ArrowRight');

      expect(
        (element.props.children as Tab[])[2].hasAttribute('active')
      ).toBe(true);
    });

    it('leaves other keys to the page', async () => {
      const { element } = createTabs();
      const list = element.shadow!.querySelector('.tab-list')!;
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true,
        cancelable: true,
      });

      list.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });
  });

  it('renders nothing selected when it has no tabs', () => {
    const element = (<Tabs />) as Tabs;
    element.render();

    expect(buttonsOf(element).length).toBe(0);
  });
});
