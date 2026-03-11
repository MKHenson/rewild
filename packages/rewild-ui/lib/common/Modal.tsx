import { Button, ButtonVariant, ButtonColor } from './Button';
import { Popup } from './Popup';
import { Typography } from './Typography';
import { Component, register } from '../Component';

export interface ModalProps {
  title?: JSX.Element | string;
  open: boolean;
  withBackground?: boolean;
  hideConfirmButtons?: boolean;
  okLabel?: string;
  cancelLabel?: string;
  okColor?: ButtonColor;
  okVariant?: ButtonVariant;
  cancelVariant?: ButtonVariant;
  hideOk?: boolean;
  hideCancel?: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onOk?: () => void;
}

@register('x-modal')
export class Modal extends Component<ModalProps> {
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
      <Popup
        open={this.props.open}
        onClose={this.props.onClose}
        withBackground={this.props.withBackground}>
        {typeof this.props.title === 'string' ? (
          <Typography variant="h3">{this.props.title}</Typography>
        ) : (
          this.props.title || ''
        )}
        <div class="content">
          <slot></slot>
        </div>
        {this.props.hideConfirmButtons ? null : (
          <div class="button-container">
            {this.props.hideCancel ? null : (
              <Button
                onClick={handleCancel}
                class="cancel"
                variant={this.props.cancelVariant || 'text'}>
                {this.props.cancelLabel || 'Cancel'}
              </Button>
            )}
            {this.props.hideOk ? null : (
              <Button
                onClick={handleOk}
                class="ok"
                color={this.props.okColor}
                variant={this.props.okVariant}>
                {this.props.okLabel || 'Okay'}
              </Button>
            )}
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
    padding: 0rem 0 1.5rem 0;
  }
`);
