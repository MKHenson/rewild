import { Component, register } from "../Component";
import { theme } from "../theme";

interface Props {
  checked?: boolean;
  onClick?: (e: MouseEvent) => void;
}

@register("x-switch")
export class Switch extends Component<Props> {
  public checked: boolean;

  init() {
    this.checked = this.props.checked || false;

    const elm = (
      <div
        class={`${this.checked ? "checked" : ""}`}
        onclick={(e) => {
          this.checked = !this.checked;
          elm.classList.toggle("checked", this.checked);
          this.props.onClick?.(e);
        }}
      />
    );

    return () => elm;
  }

  getStyle() {
    return StyledSwitch;
  }
}

const StyledSwitch = cssStylesheet(css`
  div {
    box-sizing: border-box;
    border-radius: 5px;
    cursor: pointer;
    position: relative;
    width: 40px;
    height: 25px;
  }

  div:hover::after {
    box-shadow: 0 0 0 5px rgba(0, 0, 0, 0.1), ${theme?.colors.shadowShort1};
  }

  div::before {
    content: "";
    width: 100%;
    height: 60%;
    position: absolute;
    background-color: ${theme?.colors.subtle600};
    top: 20%;
    left: 0;
    border-radius: 7px;
    transition: background-color 0.5s;
  }

  div::after {
    content: "";
    width: 50%;
    height: 80%;
    position: absolute;
    background-color: ${theme?.colors.background};
    top: 10%;
    left: 0;
    border-radius: 100%;
    transition: left 0.5s, background-color 0.5s;
    box-shadow: ${theme?.colors.shadowShort1};
  }

  div.checked::after {
    left: 50%;
    background-color: ${theme?.colors.primary400};
  }
`);
