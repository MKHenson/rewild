import '../../compiler/jsx';
import { Avatar } from './Avatar';

type AvatarOptions = NonNullable<ConstructorParameters<typeof Avatar>[0]>;
type AvatarProps = AvatarOptions['props'];

describe('Avatar', () => {
  it('renders fallback material icon when src is missing', () => {
    const props: AvatarProps = {};
    const avatar = new Avatar({ props });

    avatar._createRenderer();
    avatar.render();

    const root = avatar.shadow?.querySelector('div.avatar');
    expect(root).not.toBeNull();
    expect(root?.querySelector('x-material-icon')).not.toBeNull();
    expect(root?.querySelector('img')).toBeNull();
  });

  it('renders image and wires host click handler', () => {
    const onClick = jest.fn();
    const props: AvatarProps = {
      src: 'https://example.com/avatar.png',
      onClick,
    };
    const avatar = new Avatar({ props });

    avatar._createRenderer();
    avatar.render();
    avatar.dispatchEvent(new MouseEvent('click'));

    const img = avatar.shadow?.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/avatar.png');
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
