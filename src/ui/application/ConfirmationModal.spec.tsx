import 'rewild-ui/compiler/jsx';
import { ConfirmationModal } from './ConfirmationModal';
import { confirmationStore } from '../stores/ConfirmationStore';
import { Modal } from 'rewild-ui';

function getModal(comp: ConfirmationModal): Modal {
  return comp.shadow?.querySelector('x-modal') as Modal;
}

function createConfirmationModal(): ConfirmationModal {
  confirmationStore.open = false;
  confirmationStore.title = '';
  confirmationStore.message = '';
  confirmationStore.okLabel = undefined;
  confirmationStore.cancelLabel = undefined;
  confirmationStore.okColor = undefined;
  const comp = new ConfirmationModal();
  comp._createRenderer();
  comp.render();
  return comp;
}

describe('ConfirmationModal', () => {
  afterEach(() => {
    confirmationStore.close();
    jest.restoreAllMocks();
  });

  describe('initial state', () => {
    it('renders with the modal closed', () => {
      const comp = createConfirmationModal();
      expect(getModal(comp)._props.open).toBe(false);
    });
  });

  describe('after show()', () => {
    it('opens the modal', () => {
      const comp = createConfirmationModal();
      confirmationStore.show('Confirm', 'Are you sure?', () => {});
      expect(getModal(comp)._props.open).toBe(true);
    });

    it('shows the message in Typography', () => {
      const comp = createConfirmationModal();
      confirmationStore.show('Title', 'This action is permanent.', () => {});
      expect(comp.shadow?.querySelector('x-typography')?.textContent).toBe(
        'This action is permanent.'
      );
    });
  });

  describe('after close()', () => {
    it('closes the modal', () => {
      const comp = createConfirmationModal();
      confirmationStore.show('Title', 'Msg', () => {});
      confirmationStore.close();
      expect(getModal(comp)._props.open).toBe(false);
    });
  });

  describe('onOk callback', () => {
    it('calls confirmationStore.confirm', () => {
      const comp = createConfirmationModal();
      jest.spyOn(confirmationStore, 'confirm');
      confirmationStore.show('Title', 'Msg', () => {});
      getModal(comp)._props.onOk!();
      expect(confirmationStore.confirm).toHaveBeenCalled();
    });

    it('invokes the onConfirm handler', () => {
      const comp = createConfirmationModal();
      const onConfirm = jest.fn();
      confirmationStore.show('Title', 'Msg', onConfirm);
      getModal(comp)._props.onOk!();
      expect(onConfirm).toHaveBeenCalled();
    });

    it('closes the modal after confirming', () => {
      const comp = createConfirmationModal();
      confirmationStore.show('Title', 'Msg', () => {});
      getModal(comp)._props.onOk!();
      expect(getModal(comp)._props.open).toBe(false);
    });
  });

  describe('onCancel callback', () => {
    it('calls confirmationStore.close', () => {
      const comp = createConfirmationModal();
      jest.spyOn(confirmationStore, 'close');
      confirmationStore.show('Title', 'Msg', () => {});
      getModal(comp)._props.onCancel!();
      expect(confirmationStore.close).toHaveBeenCalled();
    });

    it('does not invoke the onConfirm handler', () => {
      const comp = createConfirmationModal();
      const onConfirm = jest.fn();
      confirmationStore.show('Title', 'Msg', onConfirm);
      getModal(comp)._props.onCancel!();
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('onClose callback', () => {
    it('calls confirmationStore.close', () => {
      const comp = createConfirmationModal();
      jest.spyOn(confirmationStore, 'close');
      confirmationStore.show('Title', 'Msg', () => {});
      getModal(comp)._props.onClose!();
      expect(confirmationStore.close).toHaveBeenCalled();
    });

    it('closes the modal', () => {
      const comp = createConfirmationModal();
      confirmationStore.show('Title', 'Msg', () => {});
      getModal(comp)._props.onClose!();
      expect(getModal(comp)._props.open).toBe(false);
    });
  });
});
