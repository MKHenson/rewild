import { Typography } from "./Typography";
import { Component, register } from "../Component";
import { theme } from "../theme";

interface Props {
  label: string;
  required?: boolean;
}

@register("x-field")
export class Field extends Component<Props> {
  init() {
    return () => (
      <div class="field">
        <Typography variant="label">
          {this.props.label}
          {this.props.required ? <span class="required">*</span> : ""}
        </Typography>
        <slot></slot>
      </div>
    );
  }

  getStyle() {
    return StyledField;
  }
}

const StyledField = cssStylesheet(css`
  :host {
    width: 100%;
    display: block;
    margin: 0 0 1rem 0;
  }

  .required {
    color: ${theme!.colors.error400};
    font-weight: 400;
    margin: 0 0 0 4px;
  }
`);
