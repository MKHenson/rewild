import '../../compiler/jsx';
import { NumberInput } from './NumberInput';

type NumberInputOptions = NonNullable<
  ConstructorParameters<typeof NumberInput>[0]
>;
type NumberInputProps = NumberInputOptions['props'];

describe('NumberInput', () => {
  it('renders input with value and type number', () => {
    const props: NumberInputProps = { value: 42 };
    const cmp = new NumberInput({ props });

    cmp._createRenderer();
    cmp.render();

    const input = cmp.shadow?.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('42');
    expect(input.type).toBe('number');
  });

  it('applies fullWidth class to wrapper', () => {
    const props: NumberInputProps = { value: 0, fullWidth: true };
    const cmp = new NumberInput({ props });

    cmp._createRenderer();
    cmp.render();

    const wrapper = cmp.shadow?.querySelector('div');
    expect(wrapper?.className).toContain('fullwidth');
  });

  it('sets disabled attribute on input', () => {
    const props: NumberInputProps = { value: 0, disabled: true };
    const cmp = new NumberInput({ props });

    cmp._createRenderer();
    cmp.render();

    const input = cmp.shadow?.querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('applies className prop to input element', () => {
    const props: NumberInputProps = { value: 0, className: 'custom' };
    const cmp = new NumberInput({ props });

    cmp._createRenderer();
    cmp.render();

    const input = cmp.shadow?.querySelector('input') as HTMLInputElement;
    expect(input.className).toBe('custom');
  });

  it('calls onChange on blur with parsed value', () => {
    const onChange = jest.fn();
    const props: NumberInputProps = { value: 10, onChange };
    const cmp = new NumberInput({ props });

    cmp._createRenderer();
    cmp.render();

    const input = cmp.shadow?.querySelector('input') as HTMLInputElement;
    input.value = '25';
    input.dispatchEvent(new Event('blur'));

    expect(onChange).toHaveBeenCalledWith(25);
  });

  it('sets step, min, and max attributes on input', () => {
    const props: NumberInputProps = {
      value: 5,
      step: 0.5,
      min: 0,
      max: 100,
    };
    const cmp = new NumberInput({ props });

    cmp._createRenderer();
    cmp.render();

    const input = cmp.shadow?.querySelector('input') as HTMLInputElement;
    expect(input.step).toBe('0.5');
    expect(input.min).toBe('0');
    expect(input.max).toBe('100');
  });
});
