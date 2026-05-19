import { MaterialIcon } from "./MaterialIcon";
import { Component, register } from "../Component";
import { theme } from "../theme";

type AvatarSize = 's' | 'm' | 'l';

interface Props {
  src?: string;
  size?: AvatarSize;
  onClick?: (e: MouseEvent) => void;
}

@register("x-avatar")
export class Avatar extends Component<Props> {
  init() {
    const img = (<img />) as HTMLImageElement;

    return () => {
      this.onclick = this.props.onClick || null;
      this.dataset.size = this.props.size ?? 'l';

      if (this.props.src) {
        if (img.src !== this.props.src) img.src = this.props.src;
        return <div class="avatar">{img}</div>;
      }
      return <div class="avatar"><MaterialIcon icon="person" /></div>;
    };
  }

  getStyle() {
    return StyledAvatar;
  }
}

const StyledAvatar = cssStylesheet(css`
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
    background-color: ${theme?.colors.secondary600};
    color: ${theme?.colors.onSecondary600};
    /* default: l */
    width: 56px;
    height: 56px;
    border: 4px solid ${theme?.colors.secondary400};
  }
  :host([data-size='s']) {
    width: 32px;
    height: 32px;
    border: 2px solid ${theme?.colors.secondary400};
    font-size: 0.875rem;
  }
  :host([data-size='m']) {
    width: 44px;
    height: 44px;
    border: 3px solid ${theme?.colors.secondary400};
    font-size: 1rem;
  }
  :host([data-size='l']) {
    width: 56px;
    height: 56px;
    border: 4px solid ${theme?.colors.secondary400};
    font-size: 1.25rem;
  }
  img {
    width: 100%;
    height: 100%;
    text-align: center;
    object-fit: cover;
    color: transparent;
    text-indent: 10000px;
  }
`);
