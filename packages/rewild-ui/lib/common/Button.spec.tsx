import '../../compiler/jsx';
import { Button } from './Button';
import { fireClick } from '../test-utils';

type ButtonOptions = NonNullable<ConstructorParameters<typeof Button>[0]>;
type ButtonProps = ButtonOptions['props'];

describe('Button', () => {
  it('applies default variant/color classes and omits boolean attrs', () => {
    const props: ButtonProps = {};
    const button = new Button({ props });
    button._createRenderer();
    button.render();

    expect(button.className).toContain('contained');
    expect(button.className).toContain('primary');
    expect(button.hasAttribute('fullwidth')).toBe(false);
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('applies props to class name and attributes', async () => {
    const onClick = jest.fn();
    const props: ButtonProps = {
      id: 'save-btn',
      class: 'custom',
      variant: 'outlined',
      color: 'secondary',
      fullWidth: true,
      disabled: true,
      onClick,
    };

    const button = new Button({
      props,
    });

    button._createRenderer();
    button.render();

    expect(button.id).toBe('save-btn');
    expect(button.className).toContain('custom');
    expect(button.className).toContain('outlined');
    expect(button.className).toContain('secondary');
    expect(button.hasAttribute('fullwidth')).toBe(true);
    expect(button.hasAttribute('disabled')).toBe(true);

    await fireClick(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the ghost variant class', () => {
    const button = new Button({ props: { variant: 'ghost' } });
    button._createRenderer();
    button.render();

    expect(button.className).toContain('ghost');
  });

  it('omits selected/aria-pressed unless given a selected state', () => {
    const button = new Button({ props: {} });
    button._createRenderer();
    button.render();

    expect(button.hasAttribute('selected')).toBe(false);
    expect(button.hasAttribute('aria-pressed')).toBe(false);
  });

  it('reflects the selected state to the attribute and aria-pressed', () => {
    const button = new Button({ props: { selected: false } });
    button._createRenderer();
    button.render();

    expect(button.hasAttribute('selected')).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');

    button.selected = true;
    expect(button.hasAttribute('selected')).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('disabled setter updates component props and disabled attribute', () => {
    const props: ButtonProps = {
      disabled: false,
    };

    const button = new Button({
      props,
    });

    button._createRenderer();
    button.render();
    expect(button.hasAttribute('disabled')).toBe(false);

    button.disabled = true;
    expect(button.hasAttribute('disabled')).toBe(true);
  });
});
