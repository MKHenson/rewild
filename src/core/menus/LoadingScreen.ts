import {
  Button,
  Label,
  Modal,
  Stack,
  UIRenderer,
  UISurface,
} from 'rewild-gpu-ui';

/** Milliseconds the screen takes to cover the game. */
export const LOADING_FADE = 250;

export interface LoadingScreenActions {
  /** Main Menu, Escape or B on a load error. */
  onQuit: () => void;
}

/**
 * Covers the game while a level loads. When the load fails, a modal says why
 * and offers the main menu.
 */
export class LoadingScreen {
  private surface: UISurface;
  private error: Modal;
  private message: Label;

  constructor(private ui: UIRenderer, actions: LoadingScreenActions) {
    this.surface = ui.createSurface({
      kind: 'screen',
      name: 'loading',
      order: 2,
      input: 'none',
    });
    const root = this.surface.root;
    Object.assign(root.style, {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#000000',
      opacity: 0,
      transition: { property: 'opacity', duration: LOADING_FADE },
    });
    root.append(
      new Label({
        name: 'label',
        text: 'Loading',
        style: { color: '#ffffff', fontSize: 24 },
      })
    );

    this.message = new Label({
      name: 'message',
      text: '',
      style: { maxWidth: 480 },
    });
    this.error = new Modal(ui, {
      name: 'load-error',
      order: 3,
      closeOnBackdrop: false,
      onClose: actions.onQuit,
    });
    this.error.append(
      new Stack({
        gap: 'l',
        style: { padding: [16, 0, 8, 0] },
        children: [
          new Label({
            name: 'title',
            text: 'The level could not load',
            style: { fontWeight: 'bold' },
          }),
          this.message,
          new Button({ label: 'Main Menu', onClick: actions.onQuit }),
        ],
      })
    );
  }

  /** True while the screen covers the game. */
  get isShown(): boolean {
    return this.surface.root.style.opacity === 1;
  }

  show(): void {
    this.surface.root.style.opacity = 1;
    this.error.close();
  }

  /** Shows why the load failed, over the screen. */
  showError(message: string): void {
    this.surface.root.style.opacity = 1;
    this.message.text = message;
    this.error.open();
  }

  hide(): void {
    this.surface.root.style.opacity = 0;
    this.error.close();
  }

  dispose(): void {
    this.ui.removeSurface(this.error.surface);
    this.ui.removeSurface(this.surface);
  }
}
