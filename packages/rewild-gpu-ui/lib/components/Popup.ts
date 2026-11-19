import { focusableAncestor, focusableNodes } from '../focus';
import { UIStyle } from '../style';
import { Dirty, Rect, UIChild, UINode } from '../UINode';
import type { UISurface } from '../UISurface';
import type { UISurfaceFactory } from './Modal';

/** The side of the anchor that the popup opens on. */
export type PopupPlacement = 'bottom' | 'top' | 'right' | 'left';

/** How the popup lines up with the anchor along that side. */
export type PopupAlign = 'start' | 'center' | 'end';

export interface PopupPosition {
  /** Defaults to `bottom`. */
  placement?: PopupPlacement;
  /** Defaults to `start`. */
  align?: PopupAlign;
  /** The gap between the anchor and the popup, in CSS pixels. Defaults to 4. */
  offset?: number;
  /** The least gap between the popup and the screen's edge. Defaults to 8. */
  margin?: number;
}

export interface PopupOptions extends PopupPosition {
  /** The surface's name. Defaults to `popup`. */
  name?: string;
  /** The surface's draw order. Defaults to 2, over a modal at 1. */
  order?: number;
  /** Called after Escape, B or a click outside closes the popup. */
  onClose?: () => void;
  /** The panel's style. */
  style?: UIStyle;
}

/**
 * A plain surface colour, with an edge and a short shadow. Glass is for
 * modals and panels over the scene. A popup's style can add it.
 */
const PANEL: UIStyle = {
  backgroundColor: 'surface',
  flexDirection: 'column',
  padding: 4,
  borderWidth: 1,
  borderColor: 'glassEdge',
  borderRadius: 4,
  color: 'onSurface',
  boxShadow: { x: 2, y: 2, blur: 4, color: '#00000080' },
};

/**
 * Where a box of `size` goes next to `anchor`, inside `bounds`. When the box
 * does not fit on the placement's side and the other side has more room, it
 * opens on the other side. Then it moves to stay `margin` in from each edge.
 * A box too large for the bounds keeps its start edge in.
 */
export function placePopup(
  anchor: Rect,
  size: { width: number; height: number },
  bounds: { width: number; height: number },
  position: PopupPosition = {}
): { x: number; y: number } {
  const placement = position.placement ?? 'bottom';
  const align = position.align ?? 'start';
  const offset = position.offset ?? 4;
  const margin = position.margin ?? 8;
  const vertical = placement === 'bottom' || placement === 'top';
  const [start, length] = vertical
    ? [anchor.y, anchor.height]
    : [anchor.x, anchor.width];
  const [crossStart, crossLength] = vertical
    ? [anchor.x, anchor.width]
    : [anchor.y, anchor.height];
  const [main, cross] = vertical
    ? [size.height, size.width]
    : [size.width, size.height];
  const [bound, crossBound] = vertical
    ? [bounds.height, bounds.width]
    : [bounds.width, bounds.height];

  const after = start + length + offset;
  const before = start - offset - main;
  const roomAfter = bound - margin - (after + main);
  const roomBefore = before - margin;
  let forward = placement === 'bottom' || placement === 'right';
  if (forward ? roomAfter < 0 : roomBefore < 0)
    if ((forward ? roomBefore : roomAfter) > (forward ? roomAfter : roomBefore))
      forward = !forward;
  const along = keepIn(forward ? after : before, main, bound, margin);

  const free = crossLength - cross;
  const across = keepIn(
    crossStart + (align === 'end' ? free : align === 'center' ? free / 2 : 0),
    cross,
    crossBound,
    margin
  );
  return vertical ? { x: across, y: along } : { x: along, y: across };
}

function keepIn(
  value: number,
  size: number,
  bound: number,
  margin: number
): number {
  return Math.max(margin, Math.min(value, bound - margin - size));
}

/**
 * A small panel that opens next to a node, such as a dropdown list, on its
 * own surface. It stays on screen: it opens on the other side when its side
 * has no room, and moves in from the edges.
 *
 * While it is open, its surface takes all input, so focus moves into it. A
 * click outside, Escape or the gamepad's B closes it, and focus goes back to
 * the node that had it when the popup opened.
 *
 * A closed popup stays in the tree at opacity 0, the same as a modal, so it
 * draws nothing and fades in when it opens.
 */
export class Popup {
  readonly surface: UISurface;
  /** The popup's panel. Add the popup's content to it. */
  readonly panel: UINode;
  onClose: (() => void) | null;
  private position: PopupPosition;
  private _anchor: UINode | null = null;
  private returnFocus: UINode | null = null;

  constructor(ui: UISurfaceFactory, options: PopupOptions = {}) {
    this.onClose = options.onClose ?? null;
    this.position = options;
    this.surface = ui.createSurface({
      kind: 'screen',
      name: options.name ?? 'popup',
      order: options.order ?? 2,
      input: 'none',
    });
    this.panel = new UINode({
      name: 'panel',
      style: {
        ...PANEL,
        ...options.style,
        position: 'absolute',
        left: 0,
        top: 0,
      },
    });
    const root = this.surface.root;
    const fade: UIStyle = {
      opacity: 0,
      transition: { property: 'opacity', duration: 150 },
    };
    Object.assign(root.style, fade);
    root.append(this.panel);
    this.surface.onLayout = () => this.place();

    root.on('keydown', (e) => {
      if (e.key === 'Escape') this.dismiss();
    });
    root.on('click', (e) => {
      if (e.target === root) this.dismiss();
    });
  }

  get isOpen(): boolean {
    return this.surface.input === 'all';
  }

  /** The node the popup opened next to, or null before it first opens. */
  get anchor(): UINode | null {
    return this._anchor;
  }

  append(...children: UIChild[]): void {
    this.panel.append(...children);
  }

  /**
   * Opens the popup next to the anchor and focuses its first focusable node.
   * The focus ring shows when the anchor's surface shows it, so a popup
   * opened from a key or the gamepad shows where focus went.
   */
  open(anchor: UINode): void {
    const from = anchor.surface;
    if (!this.isOpen) {
      this.returnFocus = from?.focused ?? null;
      this.surface.input = 'all';
      this.surface.root.style.opacity = 1;
    }
    if (anchor !== this._anchor) {
      this._anchor = anchor;
      // Lay out from the left edge, at the panel's full width, then place it.
      this.panel.style.left = 0;
      this.panel.markDirty(Dirty.Layout);
    }
    focusableNodes(this.panel)[0]?.focus({
      focusVisible: from?.focusVisible ?? false,
    });
  }

  /**
   * Closes the popup and gives focus back to the node that had it when the
   * popup opened. It does not call `onClose`.
   */
  close(): void {
    if (!this.isOpen) return;
    const visible = this.surface.focusVisible;
    this.surface.input = 'none';
    this.surface.setFocus(null);
    this.surface.root.style.opacity = 0;
    const back =
      this.returnFocus ?? (this._anchor && focusableAncestor(this._anchor));
    this.returnFocus = null;
    back?.focus({ focusVisible: visible });
  }

  /** Places the panel next to its anchor, from the sizes the last layout gave. */
  private place(): void {
    const anchor = this._anchor;
    if (!anchor) return;
    const { surface, panel, position } = this;
    const margin = position.margin ?? 8;
    const style = panel.style;
    const { x, width, height } = panel.rect;
    // Layout gives an absolute box only the room right of its left edge, so a
    // panel placed near the right edge can be squeezed against it. Lay it out
    // again from the left edge, at its full width.
    const left = style.left as number;
    if (left > margin && x + width > surface.width - margin + 0.5) {
      style.left = 0;
      return;
    }
    const at = placePopup(
      anchor.rect,
      { width, height },
      { width: surface.width, height: surface.height },
      position
    );
    style.left = at.x;
    style.top = at.y;
  }

  private dismiss(): void {
    this.close();
    this.onClose?.();
  }
}
