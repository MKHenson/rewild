import { Button, Label, Stack, UIRenderer, UISurface } from 'rewild-gpu-ui';

/** Milliseconds the death plays out before the options show and the mouse is freed. */
const OPTIONS_AFTER = 3000;

export interface GameOverActions {
  onRestart: () => void;
  onQuit: () => void;
}

/**
 * "YOU DIED" fades in over the game. After the death plays out, Restart and
 * Main Menu fade in under it, and the screen takes the mouse, the keys and
 * the gamepad.
 *
 * The title and the options are in the tree from the start at opacity 0, so
 * they fade in when they show.
 */
export class GameOverScreen {
  private surface: UISurface;
  private title: Label;
  private options: Stack;
  private timer = 0;

  constructor(private ui: UIRenderer, actions: GameOverActions) {
    this.surface = ui.createSurface({
      kind: 'screen',
      name: 'game-over',
      order: 1,
      input: 'none',
    });
    this.title = new Label({
      text: 'YOU DIED',
      style: {
        color: '#c8102e',
        fontSize: 64,
        fontWeight: 'bold',
        opacity: 0,
        transition: { property: 'opacity', duration: 2000, easing: 'ease-in' },
      },
    });
    this.options = new Stack({
      gap: 'l',
      style: {
        width: 256,
        margin: [32, 0, 0, 0],
        opacity: 0,
        transition: { property: 'opacity', duration: 500, easing: 'ease-in' },
      },
      children: [
        new Button({ label: 'Restart', onClick: actions.onRestart }),
        new Button({ label: 'Main Menu', onClick: actions.onQuit }),
      ],
    });
    const root = this.surface.root;
    root.style.flexDirection = 'column';
    root.style.justifyContent = 'center';
    root.style.alignItems = 'center';
    root.append(this.title, this.options);
  }

  /** Shows the title, then the options once the death has played out. */
  show(): void {
    if (this.title.node.style.opacity === 1) return;
    this.title.node.style.opacity = 1;
    this.timer = window.setTimeout(() => {
      if (document.pointerLockElement) document.exitPointerLock();
      this.options.node.style.opacity = 1;
      this.surface.input = 'all';
    }, OPTIONS_AFTER);
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    this.ui.removeSurface(this.surface);
  }
}
