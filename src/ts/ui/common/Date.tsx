import format from "date-fns/format";
import { Component, register } from "../Component";

interface Props {
  date?: globalThis.Date;
  withTime?: boolean;
}

@register("x-date")
export class Date extends Component<Props> {
  init() {
    return () => {
      return (
        <div>
          {this.props.date
            ? format(
                this.props.date,
                this.props.withTime || this.props.withTime === undefined ? "do MMMM y, p" : "do MMMM y"
              )
            : "-"}
        </div>
      );
    };
  }
}
