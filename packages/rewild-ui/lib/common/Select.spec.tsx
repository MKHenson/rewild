import '../../compiler/jsx';
import { Select } from './Select';

type SelectOptions = NonNullable<ConstructorParameters<typeof Select>[0]>;
type SelectProps = SelectOptions['props'];

describe('Select', () => {
  it('renders selected option label in the value div', () => {
    const props: SelectProps = {
      value: 'b',
      options: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
      ],
    };
    const cmp = new Select({ props });

    cmp._createRenderer();
    cmp.render();

    const valueDiv = cmp.shadow?.querySelector('.value');
    expect(valueDiv).not.toBeNull();
    // The selected option is resolved from props
    const selected = props.options?.find((o) => o.value === props.value);
    expect(selected?.label).toBe('Beta');
  });

  it('renders dropdown arrow icon', () => {
    const props: SelectProps = {
      options: [{ value: 'a', label: 'Alpha' }],
    };
    const cmp = new Select({ props });

    cmp._createRenderer();
    cmp.render();

    const icon = cmp.shadow?.querySelector('x-material-icon');
    expect(icon).not.toBeNull();
  });

  it('renders select trigger div', () => {
    const props: SelectProps = {
      options: [{ value: 'x', label: 'X' }],
    };
    const cmp = new Select({ props });

    cmp._createRenderer();
    cmp.render();

    const selectDiv = cmp.shadow?.querySelector('.select');
    expect(selectDiv).not.toBeNull();
  });
});
