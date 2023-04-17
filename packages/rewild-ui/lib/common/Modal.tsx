import { Button } from "./Button";
import { Popup } from "./Popup";
import { Typography } from "./Typography";
import { Component, register } from "../Component";

interface Props {
  title?: JSX.Element | string;
  open: boolean;
  withBackground?: boolean;
  hideConfirmButtons?: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onOk?: () => void;
}

@register("x-modal")
export class Modal extends Component<Props> {
  constructor() {
    super({ props: { withBackground: true } });
  }

  init() {
    const handleCancel = (e: MouseEvent) => {
      this.props.onCancel && this.props.onCancel();
      this.props.onClose && this.props.onClose();
    };

    const handleOk = (e: MouseEvent) => {
      this.props.onOk && this.props.onOk();
      this.props.onClose && this.props.onClose();
    };

    return () => (
      <Popup open={this.props.open} onClose={this.props.onClose} withBackground={this.props.withBackground}>
        {typeof this.props.title === "string" ? (
          <Typography variant="h2">{this.props.title}</Typography>
        ) : (
          this.props.title || ""
        )}
        <div class="content">
          <slot></slot>
        </div>
        {this.props.hideConfirmButtons ? (
          ""
        ) : (
          <div class="button-container">
            <Button onClick={handleCancel} class="cancel" variant="outlined">
              Cancel
            </Button>
            <Button onClick={handleOk} class="ok">
              Okay
            </Button>
          </div>
        )}
      </Popup>
    );
  }

  getStyle() {
    return StyledModal;
  }
}

const StyledModal = cssStylesheet(css`
  .button-container {
    text-align: right;
  }
  .button-container > x-button {
    margin: 0 0 0 4px;
  }
  .content {
    padding: 0.5rem 0;
  }
`);
