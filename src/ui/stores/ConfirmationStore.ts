import { ButtonColor } from 'rewild-ui';
import { Dispatcher } from 'rewild-common';

export interface ConfirmationOptions {
  okLabel?: string;
  cancelLabel?: string;
  okColor?: ButtonColor;
}

export type ConfirmationStoreEvents = { kind: 'show' } | { kind: 'close' };

export class ConfirmationStore {
  open = false;
  title = '';
  message = '';
  okLabel?: string;
  cancelLabel?: string;
  okColor?: ButtonColor;

  readonly dispatcher = new Dispatcher<ConfirmationStoreEvents>();

  private _onConfirm: (() => void) | null = null;

  show(
    title: string,
    message: string,
    onConfirm: () => void,
    options?: ConfirmationOptions
  ) {
    this._onConfirm = onConfirm;
    this.title = title;
    this.message = message;
    this.okLabel = options?.okLabel;
    this.cancelLabel = options?.cancelLabel;
    this.okColor = options?.okColor;
    this.open = true;
    this.dispatcher.dispatch({ kind: 'show' });
  }

  confirm() {
    this._onConfirm?.();
    this.close();
  }

  close() {
    this._onConfirm = null;
    this.open = false;
    this.dispatcher.dispatch({ kind: 'close' });
  }
}

export const confirmationStore = new ConfirmationStore();
