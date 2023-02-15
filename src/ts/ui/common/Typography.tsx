import { Component, register } from "../Component";

export type TypographyVariant = "h1" | "h2" | "h3" | "h4" | "body1" | "body2" | "label" | "light";
export type TypographyAlign = "center" | "inherit" | "justify" | "left" | "right";

interface Props {
  class?: string;
  variant: TypographyVariant;
  style?: string;
  onClick?: (e: MouseEvent) => void;
}

@register("x-typography")
export class Typography extends Component<Props> {
  init() {
    return () => (
      <div
        class={`typography ${this.props.variant} ${this.props.class || ""}`}
        onclick={this.props.onClick}
        style={this.props.style}
      >
        <slot></slot>
      </div>
    );
  }

  css() {
    return css`
      :host > div {
        margin: 0;
        font-family: var(--font-family);
        margin-bottom: 0.35em;
      }

      .label {
        font-weight: 500;
        font-size: 0.9rem;
        line-height: 1.367;
        letter-spacing: 0.01562em;
      }
      .light {
        font-weight: 300;
        font-size: 0.875rem;
        line-height: 1.43;
        letter-spacing: 0.01071em;
      }
      .h1 {
        font-weight: 300;
        font-size: 3rem;
        line-height: 1.167;
        letter-spacing: -0.01562em;
      }
      .h2 {
        font-weight: 300;
        font-size: 1.75rem;
        line-height: 1.2;
        letter-spacing: -0.00833em;
      }
      .h3 {
        font-weight: 400;
        font-size: 1.5rem;
        line-height: 1.167;
        letter-spacing: 0em;
      }
      .h4 {
        font-weight: 400;
        font-size: 1.125rem;
        line-height: 1.235;
        letter-spacing: 0.00735em;
      }
      .body1 {
        font-weight: 300;
        font-size: 1rem;
        line-height: 1.5;
        letter-spacing: 0.00938em;
      }
      .body2 {
        font-weight: 400;
        font-size: 0.875rem;
        line-height: 1.43;
        letter-spacing: 0.01071em;
      }
    `;
  }
}
