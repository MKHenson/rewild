import { Modal, Component, register, Typography } from 'rewild-ui';
import { confirmationStore } from '../stores/ConfirmationStore';

interface Props {}

@register('x-confirmation-modal')
export class ConfirmationModal extends Component<Props> {
  init() {
    const storeProxy = this.observeStore(confirmationStore);

    const onOk = () => {
      confirmationStore.confirm();
    };

    const onCancel = () => {
      confirmationStore.close();
    };

    return () => (
      <Modal
        open={storeProxy.open}
        title={storeProxy.title}
        okLabel={storeProxy.okLabel}
        cancelLabel={storeProxy.cancelLabel}
        okColor={storeProxy.okColor}
        onOk={onOk}
        onCancel={onCancel}
        onClose={onCancel}>
        <Typography variant="body1">{storeProxy.message}</Typography>
      </Modal>
    );
  }
}
