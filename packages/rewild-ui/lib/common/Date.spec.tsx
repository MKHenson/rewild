import '../../compiler/jsx';
import { Date as DateComponent } from './Date';

type DateOptions = NonNullable<ConstructorParameters<typeof DateComponent>[0]>;
type DateProps = DateOptions['props'];

describe('Date', () => {
  it('renders a fallback dash when date is not provided', () => {
    const props: DateProps = {};
    const dateElm = new DateComponent({ props });

    dateElm._createRenderer();
    dateElm.render();

    const content =
      (dateElm.shadow?.querySelector('div') as HTMLDivElement | null)
        ?.innerText || '';
    expect(content.trim().endsWith('-')).toBe(true);
  });

  it('renders date without time when withTime is false', () => {
    const props: DateProps = {
      date: new globalThis.Date(2020, 0, 1, 13, 45),
      withTime: false,
    };
    const dateElm = new DateComponent({ props });

    dateElm._createRenderer();
    dateElm.render();

    const content =
      (dateElm.shadow?.querySelector('div') as HTMLDivElement | null)
        ?.innerText || '';
    expect(content).toContain('2020');
    expect(content.includes(',')).toBe(false);
  });
});
