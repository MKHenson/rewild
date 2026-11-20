import { Select, SelectOptions } from './Select';
import { formSetup, PAD } from './testing';

const OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

function setup(options: Partial<SelectOptions> = {}) {
  const onChange = jest.fn();
  const form = formSetup();
  const select = new Select(form.ui, {
    options: OPTIONS,
    value: 'medium',
    onChange,
    ...options,
    style: { width: 160, margin: [20, 0, 0, 40] },
  });
  form.menu.root.append(select);
  form.update();
  const items = select.popup.panel.children;
  return { ...form, select, items, onChange };
}

describe('Select', () => {
  it('shows the chosen option', () => {
    const { select } = setup();
    expect(select.node.children[0].text).toBe('Medium');
    select.value = 'high';
    expect(select.node.children[0].text).toBe('High');
    select.value = 'none';
    expect(select.node.children[0].text).toBe('');
  });

  it('opens its list under it, as wide as it, on a click', () => {
    const { select, items, click, input } = setup();
    click(50, 30);
    expect(select.isOpen).toBe(true);
    expect(input.focusScope()).toBe(select.popup.surface);
    expect(select.popup.panel.rect).toMatchObject({ x: 40, y: 52, width: 160 });
    expect(items[1].focused).toBe(true);
    expect(items[1].style.backgroundColor).toBe('primary400');
  });

  it('picks an option on a click and closes', () => {
    const { select, items, click, onChange } = setup();
    click(50, 30);
    const { x, y } = items[2].rect;
    click(x + 2, y + 2);
    expect(select.isOpen).toBe(false);
    expect(select.value).toBe('high');
    expect(onChange.mock.calls).toEqual([['high']]);
    expect(select.node.focused).toBe(true);
  });

  it('closes with no change on a click outside', () => {
    const { select, click, onChange } = setup();
    click(50, 30);
    click(390, 290);
    expect(select.isOpen).toBe(false);
    expect(select.value).toBe('medium');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('works with the gamepad alone', () => {
    const { select, items, menu, pad, onChange } = setup();
    pad(PAD.DOWN);
    expect(select.node.focused).toBe(true);
    pad(PAD.A);
    expect(select.isOpen).toBe(true);
    expect(items[1].focused).toBe(true);
    expect(select.popup.surface.focusVisible).toBe(true);
    pad(PAD.DOWN, PAD.A);
    expect(select.isOpen).toBe(false);
    expect(select.value).toBe('high');
    expect(onChange.mock.calls).toEqual([['high']]);
    expect(menu.focused).toBe(select.node);
    expect(menu.focusVisible).toBe(true);

    // B closes the list with no change.
    pad(PAD.A, PAD.UP, PAD.B);
    expect(select.isOpen).toBe(false);
    expect(select.value).toBe('high');
    expect(menu.focused).toBe(select.node);
  });

  it('works with the keys', () => {
    const { select, key } = setup();
    select.node.focus();
    key('Enter');
    key('ArrowUp');
    key('Enter');
    expect(select.value).toBe('low');
    key('Enter');
    key('Escape');
    expect(select.isOpen).toBe(false);
    expect(select.value).toBe('low');
  });

  it('scrolls a long list, and shows the chosen option when it opens', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      value: `v${i}`,
      label: `Option ${i}`,
    }));
    const { select, items, click, update } = setup({
      options: many,
      value: 'v15',
    });
    click(50, 30);
    update();
    const panel = select.popup.panel;
    expect(panel.rect.height).toBe(256);
    expect(panel.scrollHeight).toBe(20 * 32);
    const list = { top: panel.rect.y, bottom: panel.rect.y + 256 };
    expect(items[15].rect.y).toBeGreaterThanOrEqual(list.top);
    expect(items[15].rect.y + 32).toBeLessThanOrEqual(list.bottom);
    expect(items[15].focused).toBe(true);
  });

  it('draws a thicker blue line while open', () => {
    const { select, click } = setup();
    expect(select.node.style.boxShadow).toMatchObject({ y: -1 });
    click(50, 30);
    expect(select.node.style.boxShadow).toMatchObject({
      y: -2,
      color: 'primary400',
    });
  });

  it('takes no input and closes when disabled', () => {
    const { select, click, onChange } = setup();
    click(50, 30);
    select.disabled = true;
    expect(select.isOpen).toBe(false);
    click(50, 30);
    expect(select.isOpen).toBe(false);
    expect(select.node.focused).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});
