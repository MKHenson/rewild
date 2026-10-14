import format from 'date-fns/format';
import { Component, register } from '../Component';

interface Props {
  date?: globalThis.Date | number;
  withTime?: boolean;
  /** `short` is numeric (31/03/2016), for tables and other tight spots, and shows the long form on hover. */
  variant?: 'long' | 'short';
}

const FORMATS = {
  long: { date: 'do MMMM y', dateTime: 'do MMMM y, p' },
  short: { date: 'dd/MM/y', dateTime: 'dd/MM/y, p' },
};

@register('x-date')
export class Date extends Component<Props> {
  init() {
    return () => {
      let date: globalThis.Date | null = null;

      if (this.props.date) {
        if (typeof this.props.date === 'number') {
          date = new globalThis.Date(this.props.date);
        } else {
          date = this.props.date;
        }
      }

      const withTime = this.props.withTime ?? true;
      const pick = (formats: (typeof FORMATS)['long']) =>
        withTime ? formats.dateTime : formats.date;
      const short = this.props.variant === 'short';

      const elm = (
        <div>{date ? format(date, pick(FORMATS[short ? 'short' : 'long'])) : '-'}</div>
      ) as HTMLDivElement;
      if (date && short) elm.title = format(date, pick(FORMATS.long));
      return elm;
    };
  }
}
