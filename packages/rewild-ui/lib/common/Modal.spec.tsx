import '../../compiler/jsx';
import { Modal, ModalProps } from './Modal';

describe('Modal', () => {
  function createModal(overrides: Partial<ModalProps> = {}) {
    const modal = new Modal();
    modal._props = { ...modal._props, ...overrides };
    modal._createRenderer();
    modal.render();
    return modal;
  }

  it('renders popup wrapper', () => {
    const modal = createModal({ open: true });

    const popup = modal.shadow?.querySelector('x-popup');
    expect(popup).not.toBeNull();
  });

  it('renders string title as Typography h2', () => {
    const modal = createModal({ open: true, title: 'Confirm' });

    const popup = modal.shadow?.querySelector('x-popup');
    const typo = popup?.querySelector('x-typography') as HTMLElement & {
      _props?: { variant?: string; children?: unknown[] };
    };
    expect(typo).not.toBeNull();
    expect(typo?._props?.variant).toBe('h2');
  });

  it('renders Cancel and Okay buttons by default', () => {
    const modal = createModal({ open: true });

    const popup = modal.shadow?.querySelector('x-popup');
    const buttons = popup?.querySelectorAll('x-button');
    expect(buttons?.length).toBe(2);
  });

  it('hides buttons when hideConfirmButtons is true', () => {
    const modal = createModal({ open: true, hideConfirmButtons: true });

    const popup = modal.shadow?.querySelector('x-popup');
    const buttons = popup?.querySelectorAll('x-button');
    expect(buttons?.length).toBe(0);
  });

  it('calls onCancel and onClose when cancel is clicked', () => {
    const onCancel = jest.fn();
    const onClose = jest.fn();
    const modal = createModal({ open: true, onCancel, onClose });

    const popup = modal.shadow?.querySelector('x-popup');
    // Buttons are rendered inside popup: Cancel is first, Okay is second
    const buttons = popup?.querySelectorAll('x-button');
    expect(buttons?.length).toBe(2);
    const cancelBtn = buttons![0] as HTMLElement;
    cancelBtn.dispatchEvent(new MouseEvent('click'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onOk and onClose when ok is clicked', () => {
    const onOk = jest.fn();
    const onClose = jest.fn();
    const modal = createModal({ open: true, onOk, onClose });

    const popup = modal.shadow?.querySelector('x-popup');
    const buttons = popup?.querySelectorAll('x-button');
    expect(buttons?.length).toBe(2);
    const okBtn = buttons![1] as HTMLElement;
    okBtn.dispatchEvent(new MouseEvent('click'));

    expect(onOk).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders slot for content', () => {
    const modal = createModal({ open: true });

    const popup = modal.shadow?.querySelector('x-popup');
    const content = popup?.querySelector('.content');
    expect(content).not.toBeNull();
    expect(content?.querySelector('slot')).not.toBeNull();
  });
});
