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
