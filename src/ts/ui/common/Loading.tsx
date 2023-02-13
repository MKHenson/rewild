import { Component, register } from "../Component";
import { theme } from "../theme";

interface Props {
  size?: number;
}

@register("x-loading")
export class Loading extends Component<Props> {
  init() {
    return () => {
      this.shadow?.append(<style>{generateCss(this.props.size)}</style>);
      this.shadow?.append(
        <div class="loading">
          <div></div>
          <div></div>
        </div>
      );
    };
  }
}

function generateCss(size: number = 60) {
  return css`
    :host > div {
      display: inline-block;
      position: relative;
      width: ${size}px;
      height: ${size}px;
    }

    :host > div div {
      position: absolute;
      border: 4px solid ${theme?.colors.subtle600};
      opacity: 1;
      border-radius: 50%;
      animation: lds-ripple 1s cubic-bezier(0, 0.2, 0.8, 1) infinite;
    }
    :host > div div:nth-child(2) {
      animation-delay: -0.5s;
    }

    @keyframes lds-ripple {
      0% {
        top: ${size / 2 - 4}px;
        left: ${size / 2 - 4}px;
        width: 0;
        height: 0;
        opacity: 0;
      }
      4.9% {
        top: ${size / 2 - 4}px;
        left: ${size / 2 - 4}px;
        width: 0;
        height: 0;
        opacity: 0;
      }
      5% {
        top: ${size / 2 - 4}px;
        left: ${size / 2 - 4}px;
        width: 0;
        height: 0;
        opacity: 1;
      }
      100% {
        top: 0px;
        left: 0px;
        width: ${size - 4}px;
        height: ${size - 4}px;
        opacity: 0;
      }
    }
  `;
}
