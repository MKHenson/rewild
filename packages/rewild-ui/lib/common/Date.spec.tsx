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
        ?.textContent || '';
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
        ?.textContent || '';
    expect(content).toContain('2020');
    expect(content.includes(',')).toBe(false);
  });

  describe('short variant', () => {
    const render = (props: DateProps) => {
      const dateElm = new DateComponent({ props });
      dateElm._createRenderer();
      dateElm.render();
      return dateElm.shadow!.querySelector('div') as HTMLDivElement;
    };

    it('is numeric and keeps the time', () => {
      const elm = render({ date: new globalThis.Date(2016, 2, 31, 11, 14), variant: 'short' });
      expect(elm.textContent).toBe('31/03/2016, 11:14 AM');
    });

    it('drops the time when withTime is false', () => {
      const elm = render({ date: new globalThis.Date(2026, 9, 13, 21, 59), variant: 'short', withTime: false });
      expect(elm.textContent).toBe('13/10/2026');
    });

    it('shows the long form on hover', () => {
      const elm = render({ date: new globalThis.Date(2026, 9, 13, 21, 59), variant: 'short' });
      expect(elm.title).toBe('13th October 2026, 9:59 PM');
    });

    it('still renders a dash without a date', () => {
      const elm = render({ variant: 'short' });
      expect(elm.textContent).toBe('-');
      expect(elm.title).toBe('');
    });
  });
});
