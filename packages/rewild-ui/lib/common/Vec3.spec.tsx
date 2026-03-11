import '../../compiler/jsx';
import { Vec3 } from './Vec3';

type Vec3Options = NonNullable<ConstructorParameters<typeof Vec3>[0]>;
type Vec3Props = Vec3Options['props'];

describe('Vec3', () => {
  it('renders three inputs for x, y, z', () => {
    const props: Vec3Props = {
      value: [1, 2, 3],
      onChange: jest.fn(),
    };
    const cmp = new Vec3({ props });

    cmp._createRenderer();
    cmp.render();

    const inputs = cmp.shadow?.querySelectorAll('input');
    expect(inputs?.length).toBe(3);
  });

  it('displays values formatted to 4 decimal places', () => {
    const props: Vec3Props = {
      value: [1.5, 2.123, 3],
      onChange: jest.fn(),
    };
    const cmp = new Vec3({ props });

    cmp._createRenderer();
    cmp.render();

    const x = cmp.shadow?.querySelector('input[name=x]') as HTMLInputElement;
    const y = cmp.shadow?.querySelector('input[name=y]') as HTMLInputElement;
    const z = cmp.shadow?.querySelector('input[name=z]') as HTMLInputElement;

    expect(x.value).toBe('1.5000');
    expect(y.value).toBe('2.1230');
    expect(z.value).toBe('3.0000');
  });

  it('renders default "0.0" when value is not provided', () => {
    const props: Vec3Props = {
      onChange: jest.fn(),
    };
    const cmp = new Vec3({ props });

    cmp._createRenderer();
    cmp.render();

    const x = cmp.shadow?.querySelector('input[name=x]') as HTMLInputElement;
    expect(x.value).toBe('0.0');
  });

  it('has vec3 class on root div', () => {
    const props: Vec3Props = {
      value: [0, 0, 0],
      onChange: jest.fn(),
    };
    const cmp = new Vec3({ props });

    cmp._createRenderer();
    cmp.render();

    const div = cmp.shadow?.querySelector('div.vec3');
    expect(div).not.toBeNull();
  });
});
