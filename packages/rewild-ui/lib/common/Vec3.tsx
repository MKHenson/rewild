import { Component, register } from "../Component";

type Vector3 = [number, number, number];
interface Props {
  value?: Vector3;
  autoFocus?: boolean;
  onChange: (value: Vector3) => void;
}

function convertToNumber(value: string) {
  const num = parseFloat(value);
  if (isNaN(num)) return 0;
  return num;
}

@register("x-vec3")
export class Vec3 extends Component<Props> {
  init() {
    this.onMount = () => {
      if (this.props.autoFocus) {
        const input = this.shadow?.querySelector(
          "input[name=x]"
        ) as HTMLInputElement;
        if (input) {
          input.focus();
          input.select();
        }
      }
    };

    return () => {
      const propVal = this.props.value;
      const onChange = this.props.onChange;
      const onClick = (e: MouseEvent) =>
        (e.currentTarget as HTMLInputElement).select();

      // Create Vec3 from the inputs
      const createVec3 = () => {
        const shadow = this.shadow!;
        const valX = convertToNumber(
          (shadow.querySelector(`input[name=x]`) as HTMLInputElement).value ||
            "0.0"
        );
        const valY = convertToNumber(
          (shadow.querySelector(`input[name=y]`) as HTMLInputElement).value ||
            "0.0"
        );
        const valZ = convertToNumber(
          (shadow.querySelector(`input[name=z]`) as HTMLInputElement).value ||
            "0.0"
        );
        return [valX, valY, valZ] as Vector3;
      };

      // When we press enter we call the onChange
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          const target = e.currentTarget as HTMLInputElement;
          const value = target.value;
          const name = target.name;
          const index = name === "x" ? 0 : name === "y" ? 1 : 2;

          // Do nothing if the value is the same
          if (propVal?.[index].toFixed(4) === value) return;

          onChange(createVec3());
        }
      };

      const handleBlur = (e: FocusEvent) => {
        const target = e.currentTarget as HTMLInputElement;
        const value = target.value;
        const name = target.name;
        const shadow = this.shadow!;
        const index = name === "x" ? 0 : name === "y" ? 1 : 2;

        // Do nothing if the value is the same
        if (propVal?.[index].toFixed(4) === value) return;

        // If the focus is on this same element, do nothing
        if (
          e.relatedTarget instanceof HTMLElement &&
          e.relatedTarget.getRootNode() === shadow
        )
          return;

        onChange(createVec3());
      };

      return (
        <div class="vec3">
          <div>
            <input
              name="x"
              tabIndex={0}
              onclick={onClick}
              onkeydown={handleKeyDown}
              value={propVal?.[0].toFixed(4) || "0.0"}
              onblur={handleBlur}
            />
          </div>
          <div>
            <input
              name="y"
              tabIndex={0}
              onclick={onClick}
              onkeydown={handleKeyDown}
              value={propVal?.[1].toFixed(4) || "0.0"}
              onblur={handleBlur}
            />
          </div>
          <div>
            <input
              name="z"
              tabIndex={0}
              onclick={onClick}
              onkeydown={handleKeyDown}
              value={propVal?.[2].toFixed(4) || "0.0"}
              onblur={handleBlur}
            />
          </div>
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
    display: flex;
  }

  .vec3 > div {
    flex: 1;
  }

  input {
    border: none;
    width: 100%;
    outline: none;
    height: 100%;
    box-sizing: border-box;
  }
`);
