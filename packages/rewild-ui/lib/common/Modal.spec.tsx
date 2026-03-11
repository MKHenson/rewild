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
    expect(typo?._props?.variant).toBe('h3');
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

  it('renders custom okLabel on the ok button', () => {
    const modal = createModal({ open: true, okLabel: 'Delete' });

    const popup = modal.shadow?.querySelector('x-popup');
    const buttons = popup?.querySelectorAll('x-button');
    const okBtn = buttons![1] as HTMLElement & { _props?: any };
    expect(okBtn._props?.children).toContain('Delete');
  });

  it('renders custom cancelLabel on the cancel button', () => {
    const modal = createModal({ open: true, cancelLabel: 'Dismiss' });

    const popup = modal.shadow?.querySelector('x-popup');
    const buttons = popup?.querySelectorAll('x-button');
    const cancelBtn = buttons![0] as HTMLElement & { _props?: any };
    expect(cancelBtn._props?.children).toContain('Dismiss');
  });

  it('passes okColor to the ok button', () => {
    const modal = createModal({ open: true, okColor: 'error' });

    const popup = modal.shadow?.querySelector('x-popup');
    const buttons = popup?.querySelectorAll('x-button');
    const okBtn = buttons![1] as HTMLElement & { _props?: any };
    expect(okBtn._props?.color).toBe('error');
  });

  it('passes okVariant to the ok button', () => {
    const modal = createModal({ open: true, okVariant: 'outlined' });

    const popup = modal.shadow?.querySelector('x-popup');
    const buttons = popup?.querySelectorAll('x-button');
    const okBtn = buttons![1] as HTMLElement & { _props?: any };
    expect(okBtn._props?.variant).toBe('outlined');
  });

  it('passes cancelVariant to the cancel button', () => {
    const modal = createModal({ open: true, cancelVariant: 'outlined' });

    const popup = modal.shadow?.querySelector('x-popup');
    const buttons = popup?.querySelectorAll('x-button');
    const cancelBtn = buttons![0] as HTMLElement & { _props?: any };
    expect(cancelBtn._props?.variant).toBe('outlined');
  });

  it('uses default text variant for cancel button when cancelVariant is not set', () => {
    const modal = createModal({ open: true });

    const popup = modal.shadow?.querySelector('x-popup');
    const buttons = popup?.querySelectorAll('x-button');
    const cancelBtn = buttons![0] as HTMLElement & { _props?: any };
    expect(cancelBtn._props?.variant).toBe('text');
  });

  it('hides only the cancel button when hideCancel is true', () => {
    const modal = createModal({ open: true, hideCancel: true });

    const popup = modal.shadow?.querySelector('x-popup');
    const buttons = popup?.querySelectorAll('x-button');
    expect(buttons?.length).toBe(1);
    const okBtn = buttons![0] as HTMLElement & { _props?: any };
    expect(okBtn._props?.class).toBe('ok');
  });

  it('hides only the ok button when hideOk is true', () => {
    const modal = createModal({ open: true, hideOk: true });

    const popup = modal.shadow?.querySelector('x-popup');
    const buttons = popup?.querySelectorAll('x-button');
    expect(buttons?.length).toBe(1);
    const cancelBtn = buttons![0] as HTMLElement & { _props?: any };
    expect(cancelBtn._props?.class).toBe('cancel');
  });

  it('hides both buttons individually when hideOk and hideCancel are true', () => {
    const modal = createModal({ open: true, hideOk: true, hideCancel: true });

    const popup = modal.shadow?.querySelector('x-popup');
    const buttons = popup?.querySelectorAll('x-button');
    expect(buttons?.length).toBe(0);
  });

  it('still renders button container when hideOk or hideCancel but not hideConfirmButtons', () => {
    const modal = createModal({ open: true, hideOk: true });

    const popup = modal.shadow?.querySelector('x-popup');
    const container = popup?.querySelector('.button-container');
    expect(container).not.toBeNull();
  });
});
