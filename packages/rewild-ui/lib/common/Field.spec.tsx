import '../../compiler/jsx';
import { Field } from './Field';

type FieldOptions = NonNullable<ConstructorParameters<typeof Field>[0]>;
type FieldProps = FieldOptions['props'];

describe('Field', () => {
  it('renders label text', () => {
    const props: FieldProps = { label: 'Email' };
    const field = new Field({ props });

    field._createRenderer();
    field.render();

    const wrapper = field.shadow?.querySelector('div.field');
    expect(wrapper).not.toBeNull();
    const slot = wrapper?.querySelector('slot');
    expect(slot).not.toBeNull();
    expect(field.shadow?.querySelector('.required')).toBeNull();
  });

  it('renders required marker when required is true', () => {
    const props: FieldProps = { label: 'Name', required: true };
    const field = new Field({ props });

    field._createRenderer();
    field.render();

    const required = field.shadow?.querySelector('.required');
    expect(required).not.toBeNull();
    expect((required as HTMLSpanElement).innerText.endsWith('*')).toBe(true);
  });
});
