import { register, Component } from "./Component";

interface Props {
  name: string;
  onClick?: () => void;
}

@register("hello-world")
export class HelloWorld extends Component<Props> {
  init() {
    const [count, setCount] = this.useState(0);
    const [over, setOver] = this.useState(false);

    return () => (
      <div
        onmouseover={(e) => {
          setOver(true);
        }}
        onmouseout={(e) => {
          setOver(false);
        }}
        onclick={(e) => {
          setCount(count() + 1);
          this.props.onClick?.();
        }}
        class={`tits ${over() ? "highlight" : ""}`}
      >
        <h2>
          Hello {this.props.name}! You clicked {count().toString()} many times.
        </h2>
      </div>
    );
  }

  css() {
    return css`
      :host {
        user-select: none;
        display: inline-block;
      }

      .tits {
        color: darkred;
      }

      .highlight {
        background: darkgrey;
      }

      p {
        text-align: center;
        font-weight: normal;
        padding: 1em;
        margin: 0 0 2em 0;
        background-color: #eee;
        border: 1px solid #666;
      }
    `;
  }
}
