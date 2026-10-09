import '../../compiler/jsx';
import { Switch } from './Switch';
import { fireClick, fireEvent } from '../test-utils';

type SwitchOptions = NonNullable<ConstructorParameters<typeof Switch>[0]>;
type SwitchProps = SwitchOptions['props'];

describe('Switch', () => {
  it('renders unchecked by default', () => {
    const props: SwitchProps = {};
    const sw = new Switch({ props });

    sw._createRenderer();
    sw.render();

    expect(sw.checked).toBe(false);
    const div = sw.shadow?.querySelector('div');
    expect(div?.className).not.toContain('checked');
  });

  it('renders checked when checked prop is true', () => {
    const props: SwitchProps = { checked: true };
    const sw = new Switch({ props });

    sw._createRenderer();
    sw.render();

    expect(sw.checked).toBe(true);
    const div = sw.shadow?.querySelector('div');
    expect(div?.className).toContain('checked');
  });

  it('toggles checked state on click', async () => {
    const onClick = jest.fn();
    const props: SwitchProps = { checked: false, onClick };
    const sw = new Switch({ props });

    sw._createRenderer();
    sw.render();

    const div = sw.shadow?.querySelector('div') as HTMLDivElement;
    await fireClick(div);

    expect(sw.checked).toBe(true);
    expect(div.className).toContain('checked');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('toggles back to unchecked on second click', async () => {
    const props: SwitchProps = { checked: true };
    const sw = new Switch({ props });

    sw._createRenderer();
    sw.render();

    const div = sw.shadow?.querySelector('div') as HTMLDivElement;
    await fireClick(div);

    expect(sw.checked).toBe(false);
    expect(div.className).not.toContain('checked');
  });

  function render(props: SwitchProps) {
    const sw = new Switch({ props });
    sw._createRenderer();
    sw.render();
    return { sw, elm: sw.shadow!.querySelector('.switch') as HTMLDivElement };
  }

  it('is a focusable switch for assistive tech', () => {
    const { elm } = render({ checked: true });

    expect(elm.getAttribute('role')).toBe('switch');
    expect(elm.getAttribute('aria-checked')).toBe('true');
    expect(elm.tabIndex).toBe(0);
  });

  it('reports its new state after a toggle', async () => {
    const { elm } = render({ checked: false });

    await fireClick(elm);

    expect(elm.getAttribute('aria-checked')).toBe('true');
  });

  it.each([' ', 'Enter'])('toggles on the %p key', async (key) => {
    const onClick = jest.fn();
    const { sw, elm } = render({ checked: false, onClick });

    const press = new KeyboardEvent('keydown', { key, cancelable: true });
    await fireEvent(elm, press);

    expect(sw.checked).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(press.defaultPrevented).toBe(true);
  });

  it('ignores other keys', async () => {
    const onClick = jest.fn();
    const { sw, elm } = render({ checked: false, onClick });

    await fireEvent(elm, new KeyboardEvent('keydown', { key: 'a' }));

    expect(sw.checked).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ignores clicks and leaves the tab order when disabled', async () => {
    const onClick = jest.fn();
    const { sw, elm } = render({ checked: false, disabled: true, onClick });

    await fireClick(elm);

    expect(sw.checked).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
    expect(elm.tabIndex).toBe(-1);
    expect(elm.getAttribute('aria-disabled')).toBe('true');
  });
});
