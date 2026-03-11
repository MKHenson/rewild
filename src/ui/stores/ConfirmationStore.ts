import { Store, ButtonColor } from 'rewild-ui';

export interface ConfirmationOptions {
  okLabel?: string;
  cancelLabel?: string;
  okColor?: ButtonColor;
}

interface IConfirmation {
  open: boolean;
  title: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  okColor?: ButtonColor;
}

export class ConfirmationStore extends Store<IConfirmation> {
  private _onConfirm: (() => void) | null = null;

  constructor() {
    super({
      open: false,
      title: '',
      message: '',
      okLabel: undefined,
      cancelLabel: undefined,
      okColor: undefined,
    });
  }

  show(
    title: string,
    message: string,
    onConfirm: () => void,
    options?: ConfirmationOptions
  ) {
    this._onConfirm = onConfirm;
    this.defaultProxy.title = title;
    this.defaultProxy.message = message;
    this.defaultProxy.okLabel = options?.okLabel;
    this.defaultProxy.cancelLabel = options?.cancelLabel;
    this.defaultProxy.okColor = options?.okColor;
    this.defaultProxy.open = true;
  }

  confirm() {
    this._onConfirm?.();
    this.close();
  }

  close() {
    this._onConfirm = null;
    this.defaultProxy.open = false;
  }
}

export const confirmationStore = new ConfirmationStore();
