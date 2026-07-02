import { Component, register } from '../Component';
import { theme } from '../theme';

export interface PopupProps {
  open: boolean;
  withBackground?: boolean;
  /**
   * When true (the default) the popup is promoted to the browser's top layer
   * (via the Popover API) so it renders above everything and escapes any
   * ancestor stacking/overflow context — transforms, `overflow: hidden`, low
   * `z-index`, etc. Crucially it stays exactly where it is in the DOM, so slots
   * and the owner's scoped styles keep working. Set to false to render inline.
   */
  portal?: boolean;
  onClose?: () => void;
}

@register('x-popup')
export class Popup extends Component<PopupProps> {
  // Whether the host is acting as a top-layer popover this session.
  private _usePopover = false;

  constructor() {
    super({ props: { withBackground: true, portal: true } });
  }

  init() {
    // The Popover API promotes an element to the top layer without moving it in
    // the DOM. That escapes ancestor transforms/overflow (which trap
    // position: fixed) while preserving slot projection and the owner's scoped
    // styles — both of which break if the element is relocated instead.
    this._usePopover =
      this.props.portal !== false && typeof this.showPopover === 'function';

    if (this._usePopover) this.setAttribute('popover', 'manual');

    return () => {
      const handleClick = (e: MouseEvent) => {
        if ((e.target as HTMLElement).classList.contains('wrapper')) {
          this.props.onClose && this.props.onClose();
        }
      };

      this.toggleAttribute('open', this.props.open);
      this._syncPopover();

      return (
        <div
          class={`wrapper popup ${this.props.open ? 'visible' : ''} ${
            this.props.withBackground ? 'withBackground' : ''
          }`}
          onclick={handleClick}>
          <div class="modal">
            <slot></slot>
          </div>
        </div>
      );
    };
  }

  // Keep the top-layer state in sync with the open prop. Guarded so it is a
  // no-op when unsupported or when the host isn't connected yet (e.g. in tests).
  private _syncPopover() {
    if (!this._usePopover || !this.isConnected) return;

    const isOpen = this.matches(':popover-open');
    try {
      if (this.props.open && !isOpen) this.showPopover();
      else if (!this.props.open && isOpen) this.hidePopover();
    } catch {
      /* showPopover throws if state already changed under us; ignore. */
    }
  }

  getStyle() {
    return StyledPopup;
  }
}

const StyledPopup = cssStylesheet(css`
  /* Inline fallback (portal disabled / Popover API unsupported): the host's
     visibility is driven by the open attribute. */
  :host(:not([popover])) {
    display: none;
  }
  :host(:not([popover])[open]) {
    display: initial;
  }

  /* Top-layer popover: strip the UA popover box styling so we own the layout.
     The UA hides it while closed (:not(:popover-open)). */
  :host([popover]) {
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    overflow: visible;
  }

  :host,
  :host > div {
    position: fixed;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
  }

  :host > div {
    pointer-events: none;
    background: none;
    opacity: 0;
    visibility: hidden;
    transform: scale(1.1);
    transition: visibility 0s linear 0.25s, opacity 0.25s 0s, transform 0.25s;
    z-index: 1;
  }

  :host > .withBackground {
    pointer-events: all;
    background: rgba(0, 0, 0, 0.5);
  }

  :host > .visible {
    opacity: 1;
    visibility: visible;
    transform: scale(1);
    transition: visibility 0s linear 0s, opacity 0.25s 0s, transform 0.25s;
  }

  .modal {
    pointer-events: all;
    padding: 1rem;
    background-color: ${theme?.colors.surface};
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    border-radius: 5px;
    min-width: 300px;
    box-shadow: 2px 2px 2px 4px rgba(0, 0, 0, 0.1);
  }
`);
