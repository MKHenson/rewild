import { Typography } from "../../../common/Typography";
import { Switch } from "../../../common/Switch";
import { Component, register } from "../../../Component";
import { theme } from "../../../theme";

type PropType = "string" | "boolean";

interface Props<T> {
  label: string;
  type: PropType;
  value?: T;
  readonly?: boolean;
  onChange?: (newValue: T) => void;
}

@register("x-property-value")
export class PropertyValue<T extends any> extends Component<Props<T>> {
  init() {
    const getEditor = (type: PropType) => {
      if (type === "string")
        return (
          <input
            class="string-val"
            readOnly={this.props.readonly}
            value={(this.props.value as string) || ""}
            onblur={(e) => {
              this.props.onChange?.(e.currentTarget.value as T);
            }}
            onkeydown={(e) => {
              if (!this.props.onChange) return;
              if (e.key === "Enter") this.props.onChange(e.currentTarget.value as T);
            }}
          />
        );
      if (type === "boolean")
        return (
          <Switch
            checked={this.props.value as boolean}
            onClick={(e) => {
              if (!this.props.onChange) return;
              this.props.onChange(!this.props.value as boolean as T);
            }}
          />
        );

      return null;
    };

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

// .properties > * {
//     border-top: 1px solid ${theme.colors.onSurfaceLight};
//     border-left: 1px solid ${theme.colors.onSurfaceLight};
//     border-right: 1px solid ${theme.colors.onSurfaceLight};
//   }
//   .properties > *:nth-child(even) {
//     border-left: none;
//   }
//   .properties > *:nth-last-child(1),
//   .properties > *:nth-last-child(2) {
//     border-bottom: 1px solid ${theme.colors.onSurfaceLight};
//   }
