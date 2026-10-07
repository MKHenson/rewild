import { Component, register } from "../Component";
import { theme } from "../theme";

interface Props {
  label: string;
  required?: boolean;
}

/** A label stacked above its control. Spacing between fields belongs to the container. */
@register("x-field")
export class Field extends Component<Props> {
  init() {
    return () => (
      <div class="field">
        <label>
          {this.props.label}
          {this.props.required ? <span class="required">*</span> : ""}
        </label>
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
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: ${theme.space.xs};
  }

  label {
    font-family: var(--font-family);
    font-size: 13px;
    font-weight: 500;
    color: ${theme.colors.onSurfaceLight};
  }

  .required {
    color: ${theme.colors.error400};
    margin: 0 0 0 ${theme.space.xs};
  }
`);
