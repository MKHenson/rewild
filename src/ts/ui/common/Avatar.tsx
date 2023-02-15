import { MaterialIcon } from "./MaterialIcon";
import { Component, register } from "../Component";
import { theme } from "../theme";

interface Props {
  src?: string;
  onClick?: (e: MouseEvent) => void;
}

@register("x-avatar")
export class Avatar extends Component<Props> {
  init() {
    return () => {
      this.onclick = this.props.onClick || null;
      return <div class="avatar">{this.props.src ? <img src={this.props.src} /> : <MaterialIcon icon="person" />}</div>;
    };
  }

  css() {
    return css`
      :host {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 1.25rem;
        line-height: 1;
        border-radius: 50%;
        overflow: hidden;
        user-select: none;
        width: 56px;
        height: 56px;
        background-color: ${theme?.colors.secondary600};
        border: 4px solid ${theme?.colors.secondary400};
        color: ${theme?.colors.onSecondary600};
      }
      img {
        width: 100%;
        height: 100%;
        text-align: center;
        object-fit: cover;
        color: transparent;
        text-indent: 10000px;
      }
    `;
  }
}
