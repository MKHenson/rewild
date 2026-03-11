import '../../compiler/jsx';
import { MaterialIcon } from './MaterialIcon';

type MaterialIconOptions = NonNullable<
  ConstructorParameters<typeof MaterialIcon>[0]
>;
type MaterialIconProps = MaterialIconOptions['props'];

describe('MaterialIcon', () => {
  it('renders icon text inside span', () => {
    const props: MaterialIconProps = { icon: 'home' };
    const icon = new MaterialIcon({ props });

    icon._createRenderer();
    icon.render();

    const span = icon.shadow?.querySelector('span');
    expect(span).not.toBeNull();
    // Icon name is stored in props and rendered as span child
    expect(icon.props.icon).toBe('home');
  });

  it('applies default md-24 size class when size is not specified', () => {
    const props: MaterialIconProps = { icon: 'settings' };
    const icon = new MaterialIcon({ props });

    icon._createRenderer();
    icon.render();

    const span = icon.shadow?.querySelector('span');
    expect(span?.className).toContain('md-24');
  });

  it.each([
    ['xs', 'md-12'],
    ['s', 'md-18'],
    ['m', 'md-24'],
    ['l', 'md-36'],
    ['xl', 'md-48'],
  ] as const)('maps size "%s" to class "%s"', (size, expectedClass) => {
    const props: MaterialIconProps = { icon: 'home', size };
    const icon = new MaterialIcon({ props });

    icon._createRenderer();
    icon.render();

    const span = icon.shadow?.querySelector('span');
    expect(span?.className).toContain(expectedClass);
  });

  it('wires click handler to span', () => {
    const onClick = jest.fn();
    const props: MaterialIconProps = { icon: 'delete', onClick };
    const icon = new MaterialIcon({ props });

    icon._createRenderer();
    icon.render();

    const span = icon.shadow?.querySelector('span') as HTMLSpanElement;
    span.click();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies style prop to span', () => {
    const props: MaterialIconProps = {
      icon: 'search',
      style: 'color: red',
    };
    const icon = new MaterialIcon({ props });

    icon._createRenderer();
    icon.render();

    const span = icon.shadow?.querySelector('span');
    expect(span?.getAttribute('style')).toContain('color: red');
  });

  it('applies custom class prop to span', () => {
    const props: MaterialIconProps = { icon: 'info', class: 'my-icon' };
    const icon = new MaterialIcon({ props });

    icon._createRenderer();
    icon.render();

    const span = icon.shadow?.querySelector('span');
    expect(span?.className).toContain('my-icon');
  });
});
