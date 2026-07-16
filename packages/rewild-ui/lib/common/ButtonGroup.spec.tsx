import '../../compiler/jsx';
import { ButtonGroup } from './ButtonGroup';

type ButtonGroupOptions = NonNullable<
  ConstructorParameters<typeof ButtonGroup>[0]
>;
type ButtonGroupProps = ButtonGroupOptions['props'];

describe('ButtonGroup', () => {
  it('applies provided class name and button-group class', () => {
    const props: ButtonGroupProps = { class: 'toolbar' };
    const group = new ButtonGroup({ props });

    group._createRenderer();
    group.render();

    expect(group.className).toBe('toolbar button-group');
  });

  it('applies only the button-group class when no class is given', () => {
    const group = new ButtonGroup({ props: {} });

    group._createRenderer();
    group.render();

    expect(group.className).toBe('button-group');
  });

  it('reflects fullWidth to an attribute', () => {
    const group = new ButtonGroup({ props: {} });
    group._createRenderer();
    group.render();
    expect(group.hasAttribute('fullwidth')).toBe(false);

    const wide = new ButtonGroup({ props: { fullWidth: true } });
    wide._createRenderer();
    wide.render();
    expect(wide.hasAttribute('fullwidth')).toBe(true);
  });

  it('renders slot content wrapper', () => {
    const props: ButtonGroupProps = { class: 'toolbar' };
    const group = new ButtonGroup({ props });

    group._createRenderer();
    group.render();

    const wrapper = group.shadow?.querySelector('div');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector('slot')).not.toBeNull();
  });
});
