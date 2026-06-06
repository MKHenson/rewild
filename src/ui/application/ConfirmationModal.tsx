import { Modal, Component, register, Typography } from 'rewild-ui';
import { confirmationStore } from '../stores/ConfirmationStore';

interface Props {}

@register('x-confirmation-modal')
export class ConfirmationModal extends Component<Props> {
  init() {
    this.on(confirmationStore.dispatcher);

    const onOk = () => {
      confirmationStore.confirm();
    };

    const onCancel = () => {
      confirmationStore.close();
    };

    return () => (
      <Modal
        open={confirmationStore.open}
        title={confirmationStore.title}
        okLabel={confirmationStore.okLabel}
        cancelLabel={confirmationStore.cancelLabel}
        okColor={confirmationStore.okColor}
        onOk={onOk}
        onCancel={onCancel}
        onClose={onCancel}>
        <Typography variant="body1">{confirmationStore.message}</Typography>
      </Modal>
    );
  }
}
