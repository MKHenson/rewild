import '../../compiler/jsx';
import { Input } from './Input';

type InputOptions = NonNullable<ConstructorParameters<typeof Input>[0]>;
type InputProps = InputOptions['props'];

describe('Input', () => {
  it('applies value, className, and fullWidth props', () => {
    const props: InputProps = {
      value: 'hello',
      className: 'search-input',
      fullWidth: true,
    };
    const inputCmp = new Input({ props });

    inputCmp._createRenderer();
    inputCmp.render();

    const wrapper = inputCmp.shadow?.querySelector('div');
    const input = inputCmp.shadow?.querySelector('input');

    expect(wrapper?.className).toContain('fullwidth');
    expect(input?.className).toBe('search-input');
    expect(input?.value).toBe('hello');
  });

  it('calls onChange with latest input value', () => {
    const onChange = jest.fn();
    const props: InputProps = { onChange };
    const inputCmp = new Input({ props });

    inputCmp._createRenderer();
    inputCmp.render();

    const input = inputCmp.shadow?.querySelector('input') as HTMLInputElement;
    input.value = 'updated';
    input.dispatchEvent(new Event('change'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('updated');
  });

  it('calls onClick when input is clicked', () => {
    const onClick = jest.fn();
    const props: InputProps = { onClick, value: 'abc' };
    const inputCmp = new Input({ props });

    inputCmp._createRenderer();
    inputCmp.render();

    const input = inputCmp.shadow?.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new MouseEvent('click'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
