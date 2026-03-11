import '../../compiler/jsx';
import { Typography } from './Typography';

type TypographyOptions = NonNullable<
  ConstructorParameters<typeof Typography>[0]
>;
type TypographyProps = TypographyOptions['props'];

describe('Typography', () => {
  it('applies variant class to inner div', () => {
    const props: TypographyProps = { variant: 'h1' };
    const typo = new Typography({ props });

    typo._createRenderer();
    typo.render();

    const div = typo.shadow?.querySelector('div');
    expect(div).not.toBeNull();
    expect(div?.className).toContain('typography');
    expect(div?.className).toContain('h1');
  });

  it('applies custom class alongside variant', () => {
    const props: TypographyProps = { variant: 'body2', class: 'extra' };
    const typo = new Typography({ props });

    typo._createRenderer();
    typo.render();

    const div = typo.shadow?.querySelector('div');
    expect(div?.className).toContain('body2');
    expect(div?.className).toContain('extra');
  });

  it('renders slot for children', () => {
    const props: TypographyProps = { variant: 'label' };
    const typo = new Typography({ props });

    typo._createRenderer();
    typo.render();

    const slot = typo.shadow?.querySelector('slot');
    expect(slot).not.toBeNull();
  });

  it('wires click handler', () => {
    const onClick = jest.fn();
    const props: TypographyProps = { variant: 'h2', onClick };
    const typo = new Typography({ props });

    typo._createRenderer();
    typo.render();

    const div = typo.shadow?.querySelector('div') as HTMLDivElement;
    div.click();

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
