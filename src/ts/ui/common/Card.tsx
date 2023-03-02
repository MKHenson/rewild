import { Component, register } from "../Component";
import { theme } from "../theme";

export type ButtonVariant = "contained" | "outlined";
export type ButtonColor = "primary" | "secondary" | "error";

interface Props {
  pushed?: boolean;
  raised?: boolean;
  button?: boolean;
  onClick?: (e: MouseEvent) => void;
}

@register("x-card")
export class Card extends Component<Props> {
  init() {
    return () => (
      <div
        class={`card ${this.props.pushed ? "pushed" : ""} ${this.props.button ? "button" : ""} ${
          this.props.raised ? "raised" : ""
        }`}
        onclick={this.props.onClick}
      >
        {this.props.children}
      </div>
    );
  }

  getStyle() {
    return StyledCard;
  }
}

const StyledCard = cssStylesheet(css`
  :host {
    display: block;
    padding: 1rem;
    background-color: ${theme?.colors.surface};
    box-sizing: border-box;
    border-radius: 5px;
  }
  .card {
  }

  .card.button {
    cursor: pointer;
  }
  .card.raised {
    box-shadow: ${theme?.colors.shadowShort1};
  }
  .card.raised:hover {
    box-shadow: ${theme?.colors.shadowShort2};
  }
  .card.pushed.raised {
    box-shadow: ${theme?.colors.shadowShort1}, inset 0 0 0px 2px ${theme?.colors.primary400};
  }
`);
