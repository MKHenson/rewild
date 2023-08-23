import { IOption, PropValueType, Vector3 } from "models";
import { theme, Component, register, Switch, Typography, Select, Vec3 } from "rewild-ui";

interface Props<T> {
  label: string;
  type: PropValueType;
  value?: T;
  options?: IOption[];
  readonly?: boolean;
  onChange?: (newValue: T) => void;
  refocus: boolean;
}

@register("x-property-value")
export class PropertyValue<T extends any> extends Component<Props<T>> {
  init() {
    const getEditor = (type: PropValueType) => {
      const value = this.props.value;
      const onChange = this.props.onChange;

      switch (type) {
        case "string":
          return (
            <input
              class="string-val"
              readOnly={this.props.readonly}
              value={(value as string) || ""}
              onblur={(e) => {
                onChange?.(e.currentTarget.value as T);
              }}
              onkeydown={(e) => {
                if (!onChange) return;
                if (e.key === "Enter") onChange(e.currentTarget.value as T);
              }}
            />
          );
        case "boolean":
          return (
            <Switch
              checked={value as boolean}
              onClick={(e) => {
                if (!onChange) return;
                onChange(!value as boolean as T);
              }}
            />
          );
        case "enum":
          return (
            <Select
              options={this.props.options || []}
              value={value as string}
              onChange={(e) => {
                if (!onChange) return;
                onChange(e as T);
              }}
            />
          );
        case "vec3":
          return (
            <Vec3
              value={value as Vector3}
              autoFocus={this.props.refocus}
              onChange={(e) => {
                if (!onChange) return;
                onChange(e as T);
              }}
            />
          );
        default:
          return null;
      }
    };

    this.onMount = this.props.refocus
      ? () => {
          const input = this.shadow?.querySelector(".string-val") as HTMLInputElement;
          if (input) {
            input.focus();
            input.select();
          }
        }
      : undefined;

    return () => [
      <div class="label">
        <Typography variant="label">{this.props.label}</Typography>
      </div>,
      <div class="value">{getEditor(this.props.type)}</div>,
    ];
  }

  getStyle() {
    return StyledPropValue;
  }
}

const StyledPropValue = cssStylesheet(css`
  :host {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid ${theme.colors.onSurfaceLight};
  }

  .label {
    border-right: 1px solid ${theme.colors.onSurfaceLight};
    border-left: 1px solid ${theme.colors.onSurfaceLight};
  }

  .value {
    border-right: 1px solid ${theme.colors.onSurfaceLight};
  }

  .string-val {
    width: 100%;
    outline: none;
    border: none;
    box-sizing: border-box;
    height: 100%;
  }

  :host([readonly]) {
    background: ${theme.colors.subtle400};
  }
`);
