import '../../compiler/jsx';
import { Icon } from './Icon';
import { fireClick } from '../test-utils';

type IconOptions = NonNullable<ConstructorParameters<typeof Icon>[0]>;
type IconProps = IconOptions['props'];

describe('Icon', () => {
  it('renders a lucide svg inside the span', () => {
    const props: IconProps = { icon: 'house' };
    const icon = new Icon({ props });

    icon._createRenderer();
    icon.render();

    const svg = icon.shadow?.querySelector('span > svg');
    expect(svg).not.toBeNull();
    expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    // Lucide strokes with currentColor so the icon follows its container.
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
  });

  it('renders the paths of the requested icon', () => {
    const house = new Icon({ props: { icon: 'house' } });
    const search = new Icon({ props: { icon: 'search' } });

    house._createRenderer();
    house.render();
    search._createRenderer();
    search.render();

    const housePath = house.shadow
      ?.querySelector('svg > path')
      ?.getAttribute('d');
    const searchPath = search.shadow
      ?.querySelector('svg > path')
      ?.getAttribute('d');

    expect(housePath).toBeTruthy();
    expect(searchPath).toBeTruthy();
    expect(housePath).not.toBe(searchPath);
  });

  it('sizes to 24px when size is not specified', () => {
    const props: IconProps = { icon: 'settings' };
    const icon = new Icon({ props });

    icon._createRenderer();
    icon.render();

    const svg = icon.shadow?.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('24');
    expect(svg?.getAttribute('height')).toBe('24');
  });

  it.each([
    ['xs', '12'],
    ['s', '18'],
    ['m', '24'],
    ['l', '36'],
    ['xl', '48'],
  ] as const)('maps size "%s" to %spx', (size, expectedPx) => {
    const props: IconProps = { icon: 'house', size };
    const icon = new Icon({ props });

    icon._createRenderer();
    icon.render();

    const svg = icon.shadow?.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe(expectedPx);
    expect(svg?.getAttribute('height')).toBe(expectedPx);
  });

  it('wires click handler to span', async () => {
    const onClick = jest.fn();
    const props: IconProps = { icon: 'trash-2', onClick };
    const icon = new Icon({ props });

    icon._createRenderer();
    icon.render();

    const span = icon.shadow?.querySelector('span') as HTMLSpanElement;
    await fireClick(span);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies style prop to span', () => {
    const props: IconProps = {
      icon: 'search',
      style: 'color: red',
    };
    const icon = new Icon({ props });

    icon._createRenderer();
    icon.render();

    const span = icon.shadow?.querySelector('span');
    expect(span?.getAttribute('style')).toContain('color: red');
  });

  it('applies custom class prop to span', () => {
    const props: IconProps = { icon: 'info', class: 'my-icon' };
    const icon = new Icon({ props });

    icon._createRenderer();
    icon.render();

    const span = icon.shadow?.querySelector('span');
    expect(span?.className).toContain('my-icon');
  });
});
