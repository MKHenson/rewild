import { Component, register } from "../Component";

interface Props {
  class?: string;
}

@register("x-button-group")
export class ButtonGroup extends Component<Props> {
  init() {
    return () => {
      this.shadow!.append(
        <div class={`${this.props.class} button-group`}>
          <slot></slot>
        </div>
      );
    };
  }

  css() {
    return css`
      div {
        display: inline-flex;
      }

      x-button {
        transform: scale(1);
      }

      x-button:active {
        transform: scale(0.8);
      }

      > x-button:not(:last-of-type) {
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
        border-right-color: transparent;
      }

      > x-button:not(:first-of-type) {
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
      }
    `;
  }
}
