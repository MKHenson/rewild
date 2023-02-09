import { register, Component } from "./Component";

interface Props {
  name: string;
  onClick: () => void;
}

@register("hello-world")
export class HelloWorld extends Component<Props> {
  init() {
    const [count, setCount] = this.useState(0);
    const [over, setOver] = this.useState(false);

    return () => {
      this.shadow.innerHTML = "";
      this.shadow.append(
        ...[
          <style>{StyleHost}</style>,
          <p
            onmouseover={(e) => {
              console.log("over");
              setOver(true);
            }}
            onmouseout={(e) => {
              console.log("out");
              setOver(false);
            }}
            onclick={(e) => {
              setCount(count() + 1);
              this.props.onClick();
            }}
            class={`tits ${over() ? "highlight" : ""}`}
          >
            Hello {this.props.name}! You clicked {count().toString()} many times.
          </p>,
        ]
      );
    };
  }

  // static get observedAttributes() {
  //   return ["name"];
  // }

  // attributeChangedCallback(property: keyof Pick<HelloWorld, "name">, oldValue: string, newValue: string) {
  //   if (oldValue === newValue) return;
  //   this[property] = newValue;
  //   this.render();
  // }
}

const StyleHost = css`
  :host {
    user-select: none;
    position: absolute;
    top: 0;
    left: 0;
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
