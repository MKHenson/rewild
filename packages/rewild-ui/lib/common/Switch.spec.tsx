import '../../compiler/jsx';
import { Switch } from './Switch';

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

  it('toggles checked state on click', () => {
    const onClick = jest.fn();
    const props: SwitchProps = { checked: false, onClick };
    const sw = new Switch({ props });

    sw._createRenderer();
    sw.render();

    const div = sw.shadow?.querySelector('div') as HTMLDivElement;
    div.click();

    expect(sw.checked).toBe(true);
    expect(div.className).toContain('checked');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('toggles back to unchecked on second click', () => {
    const props: SwitchProps = { checked: true };
    const sw = new Switch({ props });

    sw._createRenderer();
    sw.render();

    const div = sw.shadow?.querySelector('div') as HTMLDivElement;
    div.click();

    expect(sw.checked).toBe(false);
    expect(div.className).not.toContain('checked');
  });
});
