import format from 'date-fns/format';
import { Component, register } from '../Component';

interface Props {
  date?: globalThis.Date | number;
  withTime?: boolean;
}

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

      return (
        <div>
          {date
            ? format(
                date,
                this.props.withTime || this.props.withTime === undefined
                  ? 'do MMMM y, p'
                  : 'do MMMM y'
              )
            : '-'}
        </div>
      );
    };
  }
}
