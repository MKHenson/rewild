import '../../compiler/jsx';
import { Card } from './Card';

type CardOptions = NonNullable<ConstructorParameters<typeof Card>[0]>;
type CardProps = CardOptions['props'];

describe('Card', () => {
  it('applies attrs and classes from props', () => {
    const props: CardProps = {
      button: true,
      disabled: true,
      pushed: true,
      raised: true,
      stretched: true,
    };
    const card = new Card({ props });

    card._createRenderer();
    card.render();

    expect(card.hasAttribute('button')).toBe(true);
    expect(card.hasAttribute('disabled')).toBe(true);
    expect(card.hasAttribute('stretched')).toBe(true);
    expect(card.classList.contains('pushed')).toBe(true);
    expect(card.classList.contains('raised')).toBe(true);
  });

  it('wires click handler when enabled', () => {
    const onClick = jest.fn();
    const props: CardProps = {
      disabled: false,
      onClick,
    };
    const card = new Card({ props });

    card._createRenderer();
    card.render();
    card.dispatchEvent(new MouseEvent('click'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not wire click handler when disabled', () => {
    const onClick = jest.fn();
    const props: CardProps = {
      disabled: true,
      onClick,
    };
    const card = new Card({ props });

    card._createRenderer();
    card.render();
    card.dispatchEvent(new MouseEvent('click'));

    expect(onClick).not.toHaveBeenCalled();
  });
});
