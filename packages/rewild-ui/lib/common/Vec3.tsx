import { Vector3 } from "rewild-common";
import { Component, register } from "../Component";

interface Props {
  value?: Vector3;
  onChange: (value: Vector3) => void;
}

function convertToNumber(value: string) {
  const num = parseFloat(value);
  if (isNaN(num)) return 0;
  return num;
}

function createVectorBasedOnComponent(
  val: string,
  component: "x" | "y" | "z",
  cur: Vector3 = new Vector3()
) {
  const num = convertToNumber(val);
  cur[component] = num;
  return cur;
}

@register("x-vec3")
export class Vec3 extends Component<Props> {
  init() {
    return () => {
      return (
        <div class="vec3">
          <input
            class="vec-x"
            value={this.props.value?.x || "0.0"}
            onchange={(e) =>
              this.props.onChange(
                createVectorBasedOnComponent(
                  e.currentTarget.value,
                  "x",
                  this.props.value
                )
              )
            }
          />
          <input
            class="vec-y"
            value={this.props.value?.y || "0.0"}
            onchange={(e) =>
              this.props.onChange(
                createVectorBasedOnComponent(
                  e.currentTarget.value,
                  "y",
                  this.props.value
                )
              )
            }
          />
          <input
            class="vec-z"
            value={this.props.value?.z || "0.0"}
            onchange={(e) =>
              this.props.onChange(
                createVectorBasedOnComponent(
                  e.currentTarget.value,
                  "z",
                  this.props.value
                )
              )
            }
          />
        </div>
      );
    };
  }

  getStyle() {
    return StyledSelect;
  }
}

const StyledSelect = cssStylesheet(css`
  :host {
    position: relative;
    display: block;
  }

  .vec3 {
    padding: 2px;
    display: flex;
  }

  .vec3 > input {
    flex: 1;
  }
`);
