import '../../compiler/jsx';
import { Button } from './Button';

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

  it('applies props to class name and attributes', () => {
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

    button.dispatchEvent(new MouseEvent('click'));
    expect(onClick).toHaveBeenCalledTimes(1);
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
