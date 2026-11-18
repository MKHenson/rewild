import { glassSurface } from '../glassStyle';
import { UIStyle } from '../style';
import { UIChild, UINode } from '../UINode';
import type { UISurface, UISurfaceOptions } from '../UISurface';

/** Makes surfaces, as `UIRenderer` does. */
export interface UISurfaceFactory {
  createSurface(options: UISurfaceOptions): UISurface;
}

export interface ModalOptions {
  /** The surface's name. Defaults to `modal`. */
  name?: string;
  /** The surface's draw order. Defaults to 1, over a HUD at 0. */
  order?: number;
  /** A click on the dimmed backdrop closes the modal. Defaults to true, as in the DOM. */
  closeOnBackdrop?: boolean;
  /** Called after Escape, B or a click on the backdrop closes the modal. */
  onClose?: () => void;
  /** The glass panel's style. */
  style?: UIStyle;
}

/** The DOM modal's glass: its edge, its radius and its shadows. */
const PANEL: UIStyle = {
  ...glassSurface(),
  flexDirection: 'column',
  minWidth: 300,
  padding: 16,
  borderWidth: 1,
  borderColor: 'glassEdge',
  borderRadius: 14,
  color: 'onSurface',
  boxShadow: [
    { y: 30, blur: 80, color: '#00000059' },
    { inset: true, y: 1, color: '#ffffff14' },
  ],
};

/** A closed modal is see-through and a little larger, so it fades and shrinks in. */
const CLOSED_SCALE = { scale: 1.1 };

/**
 * A glass panel in the middle of its own surface, over a dimmed backdrop.
 * While it is open, the surface takes all input, so focus stays in it.
 * Escape and the gamepad's B close it. A white light on the glass and its
 * edge follows the pointer.
 *
 * A closed modal stays in the tree at opacity 0, so it draws nothing, and its
 * surface takes no input. It is drawn at opacity 0 before it opens, so it
 * fades in. A node shown from `display: 'none'` would jump.
 */
export class Modal {
  readonly surface: UISurface;
  /** The glass panel. Add the modal's content to it. */
  readonly panel: UINode;
  onClose: (() => void) | null;
  private closeOnBackdrop: boolean;

  constructor(ui: UISurfaceFactory, options: ModalOptions = {}) {
    this.onClose = options.onClose ?? null;
    this.closeOnBackdrop = options.closeOnBackdrop ?? true;
    this.surface = ui.createSurface({
      kind: 'screen',
      name: options.name ?? 'modal',
      order: options.order ?? 1,
      input: 'none',
    });
    this.panel = new UINode({
      name: 'panel',
      style: { ...PANEL, ...options.style },
    });
    const root = this.surface.root;
    const backdrop: UIStyle = {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#00000080',
      opacity: 0,
      transform: CLOSED_SCALE,
      transition: [
        { property: 'opacity', duration: 250 },
        { property: 'transform', duration: 250 },
      ],
    };
    Object.assign(root.style, backdrop);
    root.append(this.panel);
    // The light starts at the top in the middle, as in the DOM.
    this.panel.setEffectParams(0.5, 0, 1, 0);
    this.panel.on('pointermove', (e) => {
      const { x, y, width, height } = this.panel.rect;
      if (width > 0 && height > 0)
        this.panel.setEffectParams((e.x - x) / width, (e.y - y) / height, 1, 0);
    });

    root.on('keydown', (e) => {
      if (e.key === 'Escape') this.dismiss();
    });
    root.on('click', (e) => {
      if (this.closeOnBackdrop && e.target === root) this.dismiss();
    });
  }

  get isOpen(): boolean {
    return this.surface.input === 'all';
  }

  append(...children: UIChild[]): void {
    this.panel.append(...children);
  }

  open(): void {
    if (this.isOpen) return;
    this.surface.input = 'all';
    this.surface.root.style.opacity = 1;
    this.surface.root.style.transform = undefined;
  }

  /** Closes the modal. It does not call `onClose`. */
  close(): void {
    if (!this.isOpen) return;
    this.surface.input = 'none';
    this.surface.setFocus(null);
    this.surface.root.style.opacity = 0;
    this.surface.root.style.transform = CLOSED_SCALE;
  }

  private dismiss(): void {
    this.close();
    this.onClose?.();
  }
}
