import { Component, register } from "../Component";
import { theme } from "../theme";

export type ButtonVariant = "contained" | "outlined";
export type ButtonColor = "primary" | "secondary" | "error";

interface Props {
  pushed?: boolean;
  raised?: boolean;
  button?: boolean;
  stretched?: boolean;
  onClick?: (e: MouseEvent) => void;
}

@register("x-card")
export class Card extends Component<Props> {
  init() {
    return () => {
      this.toggleAttribute("button", this.props.button);
      this.classList.toggle("pushed", this.props.pushed || false);
      this.classList.toggle("raised", this.props.raised || false);
      this.toggleAttribute("stretched", this.props.stretched || false);
      if (this.props.onClick) this.onclick = this.props.onClick;
      return <slot></slot>;
    };
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

  :host([stretched]) {
    width: 100%;
    height: 100%;
  }

  :host([button]) {
    cursor: pointer;
  }
  :host(.raised) {
    box-shadow: ${theme?.colors.shadowShort1};
  }
  :host(.raised):hover {
    box-shadow: ${theme?.colors.shadowShort2};
  }
  :host(.pushed.raised) {
    box-shadow: ${theme?.colors.shadowShort1}, inset 0 0 0px 2px ${theme?.colors.primary400};
  }
`);
