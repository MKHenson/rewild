import { Button } from "./common/Button";
import { register, Component } from "./Component";
import { authStore } from "./stores/Auth";

interface Props {
  name: string;
  onClick?: () => void;
}

@register("hello-world")
export class HelloWorld extends Component<Props> {
  init() {
    const [count, setCount] = this.useState(0);
    const [over, setOver] = this.useState(false);
    const user = this.observeStore(authStore);

    return () => {
      this.shadow!.append(
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
          <Button onClick={(e) => (user.loggedIn = !user.loggedIn)}>
            {user.user.name} is {user.loggedIn ? "LOGGED IN" : "LOGGED OUT"}
          </Button>
          <div>
            {user.user.name} has {user.user.pies.length.toString()} Pies!
          </div>
        </div>
      );
    };
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
