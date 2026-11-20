import { Button } from './Button';
import { Tabs, TabsOptions } from './Tabs';
import { formSetup, PAD } from './testing';

function setup(options: Partial<TabsOptions> = {}) {
  const onChange = jest.fn();
  const buttons = ['A', 'B', 'C'].map((label) => new Button({ label }));
  const tabs = new Tabs({
    onChange,
    tabs: [
      { label: 'Display', children: [buttons[0]] },
      { label: 'Audio', children: [buttons[1]] },
      { label: 'Interface', children: [buttons[2]] },
    ],
    ...options,
    style: { width: 300, height: 200 },
  });
  const form = formSetup(tabs);
  form.update();
  const tabNodes = tabs.node.children[0].children;
  return { ...form, tabs, buttons, tabNodes, onChange };
}

const shows = (tabs: Tabs) =>
  tabs.panels.map((panel) => panel.style.display !== 'none');

describe('Tabs', () => {
  it('shows only the open panel', () => {
    const { tabs, buttons } = setup({ active: 1 });
    expect(tabs.active).toBe(1);
    expect(shows(tabs)).toEqual([false, true, false]);
    expect(buttons[1].node.parent).toBe(tabs.panels[1]);
  });

  it('opens a tab on a click', () => {
    const { tabs, tabNodes, click, onChange } = setup();
    const { x, y } = tabNodes[2].rect;
    click(x + 2, y + 2);
    expect(tabs.active).toBe(2);
    expect(shows(tabs)).toEqual([false, false, true]);
    expect(tabNodes[2].focused).toBe(true);
    expect(onChange.mock.calls).toEqual([[2]]);
  });

  it('gives focus only to the open tab', () => {
    const { tabNodes } = setup();
    expect(tabNodes.map((n) => n.style.focusable)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('opens the next tab with the arrows along the row, and wraps', () => {
    const { tabs, tabNodes, menu, key, onChange } = setup();
    tabNodes[0].focus();
    key('ArrowRight');
    expect(tabs.active).toBe(1);
    expect(tabNodes[1].focused).toBe(true);
    expect(menu.focusVisible).toBe(true);
    key('ArrowLeft');
    key('ArrowLeft');
    expect(tabs.active).toBe(2);
    key('Home');
    expect(tabs.active).toBe(0);
    key('End');
    expect(tabs.active).toBe(2);
    expect(onChange.mock.calls).toEqual([[1], [0], [2], [0], [2]]);
  });

  it('skips disabled tabs', () => {
    const { tabs, tabNodes, key, click } = setup({
      tabs: [
        { label: 'One' },
        { label: 'Two', disabled: true },
        { label: 'Three' },
      ],
    });
    tabNodes[0].focus();
    key('ArrowRight');
    expect(tabs.active).toBe(2);
    const { x, y } = tabNodes[1].rect;
    click(x + 2, y + 2);
    expect(tabs.active).toBe(2);
  });

  it('opens tabs with the d-pad and moves into the panel', () => {
    const { tabs, buttons, tabNodes, pad } = setup();
    pad(PAD.DOWN);
    expect(tabNodes[0].focused).toBe(true);
    pad(PAD.RIGHT);
    expect(tabs.active).toBe(1);
    pad(PAD.DOWN);
    expect(buttons[1].node.focused).toBe(true);
    pad(PAD.UP);
    expect(tabNodes[1].focused).toBe(true);
  });

  it('steps with up and down in a column, and moves right into the panel', () => {
    const { tabs, buttons, tabNodes, pad } = setup({
      orientation: 'vertical',
    });
    expect(tabNodes[1].rect.y).toBeGreaterThan(tabNodes[0].rect.y);
    pad(PAD.DOWN);
    expect(tabNodes[0].focused).toBe(true);
    pad(PAD.DOWN, PAD.DOWN);
    expect(tabs.active).toBe(2);
    pad(PAD.RIGHT);
    expect(buttons[2].node.focused).toBe(true);
  });

  it('scrolls a long panel as the d-pad moves down it', () => {
    const rows = Array.from(
      { length: 10 },
      (_, i) => new Button({ label: `Row ${i}`, style: { height: 40 } })
    );
    const { tabs, pad } = setup({ tabs: [{ label: 'Long', children: rows }] });
    const panel = tabs.panels[0];
    pad(PAD.DOWN);
    for (let i = 0; i < 10; i++) pad(PAD.DOWN);
    expect(rows[9].node.focused).toBe(true);
    expect(panel.scrollTop).toBeGreaterThan(0);
    expect(rows[9].node.rect.y + 40).toBeLessThanOrEqual(
      panel.rect.y + panel.rect.height
    );
  });
});
