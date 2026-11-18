import { Button, Modal, Stack, UIRenderer } from 'rewild-gpu-ui';

export interface InGameMenuActions {
  onResume: () => void;
  onSettings: () => void;
  onQuit: () => void;
  /** Escape or the gamepad's B closed the menu. */
  onClose: () => void;
}

/**
 * The menu that Escape opens in the game: Resume, Settings and Quit on a
 * glass modal. It works with a mouse, a keyboard and a gamepad.
 */
export class InGameMenu {
  private modal: Modal;

  constructor(private ui: UIRenderer, actions: InGameMenuActions) {
    // A click outside the panel does not close it, so a stray click does not
    // drop the player back into the game.
    this.modal = new Modal(ui, {
      name: 'in-game-menu',
      closeOnBackdrop: false,
      onClose: actions.onClose,
    });
    this.modal.append(
      new Stack({
        gap: 'l',
        style: { padding: [16, 0, 8, 0] },
        children: [
          new Button({ label: 'Resume', onClick: actions.onResume }),
          new Button({
            label: 'Settings',
            icon: 'settings',
            onClick: actions.onSettings,
          }),
          new Button({ label: 'Quit', onClick: actions.onQuit }),
        ],
      })
    );
  }

  get isOpen(): boolean {
    return this.modal.isOpen;
  }

  set isOpen(open: boolean) {
    if (open) this.modal.open();
    else this.modal.close();
  }

  dispose(): void {
    this.ui.removeSurface(this.modal.surface);
  }
}
