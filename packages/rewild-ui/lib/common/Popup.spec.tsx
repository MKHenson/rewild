import '../../compiler/jsx';
import { Popup, PopupProps } from './Popup';
import { fireClick } from '../test-utils';

describe('Popup', () => {
  function createPopup(overrides: Partial<PopupProps> = {}) {
    const popup = new Popup();
    popup._props = { ...popup._props, ...overrides };
    popup._createRenderer();
    popup.render();
    return popup;
  }

  it('toggles open attribute based on open prop', () => {
    const popup = createPopup({ open: true });
    expect(popup.hasAttribute('open')).toBe(true);
  });

  it('does not set open attribute when closed', () => {
    const popup = createPopup({ open: false });
    expect(popup.hasAttribute('open')).toBe(false);
  });

  it('applies visible class when open', () => {
    const popup = createPopup({ open: true });

    const wrapper = popup.shadow?.querySelector('.wrapper');
    expect(wrapper?.className).toContain('visible');
  });

  it('applies withBackground class by default', () => {
    const popup = createPopup({ open: true });

    const wrapper = popup.shadow?.querySelector('.wrapper');
    expect(wrapper?.className).toContain('withBackground');
  });

  it('omits withBackground class when prop is false', () => {
    const popup = createPopup({ open: true, withBackground: false });

    const wrapper = popup.shadow?.querySelector('.wrapper');
    expect(wrapper?.className).not.toContain('withBackground');
  });

  it('renders modal content wrapper with slot', () => {
    const popup = createPopup({ open: true });

    const modal = popup.shadow?.querySelector('.modal');
    expect(modal).not.toBeNull();
    expect(modal?.querySelector('slot')).not.toBeNull();
  });

  it('calls onClose when wrapper is clicked', async () => {
    const onClose = jest.fn();
    const popup = createPopup({ open: true, onClose });

    const wrapper = popup.shadow?.querySelector('.wrapper') as HTMLDivElement;
    wrapper.classList.add('wrapper');
    await fireClick(wrapper);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('portal (top layer)', () => {
    // jsdom has no Popover API, so mock it to exercise the top-layer path.
    // Mocks must be installed before _createRenderer(), which runs init().
    function mountPopup(
      overrides: Partial<PopupProps> = {},
      { popover = false } = {}
    ) {
      const container = document.createElement('div');
      document.body.appendChild(container);

      const popup = new Popup();
      popup._props = { ...popup._props, open: true, ...overrides };

      let popoverOpen = false;
      const showPopover = jest.fn(() => {
        popoverOpen = true;
      });
      const hidePopover = jest.fn(() => {
        popoverOpen = false;
      });
      if (popover) {
        (popup as any).showPopover = showPopover;
        (popup as any).hidePopover = hidePopover;
        const realMatches = popup.matches.bind(popup);
        (popup as any).matches = (sel: string) =>
          sel === ':popover-open' ? popoverOpen : realMatches(sel);
      }

      popup._createRenderer();
      container.appendChild(popup); // triggers connectedCallback -> render

      return { container, popup, showPopover, hidePopover };
    }

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('does not relocate itself in the DOM', () => {
      const { container, popup } = mountPopup({}, { popover: true });

      expect(popup.parentNode).toBe(container);
    });

    it('promotes itself to the top layer when supported', () => {
      const { popup, showPopover } = mountPopup({}, { popover: true });

      expect(popup.getAttribute('popover')).toBe('manual');
      expect(showPopover).toHaveBeenCalledTimes(1);
    });

    it('does not use the top layer when portal is false', () => {
      const { popup, showPopover } = mountPopup(
        { portal: false },
        { popover: true }
      );

      expect(popup.hasAttribute('popover')).toBe(false);
      expect(showPopover).not.toHaveBeenCalled();
    });

    it('hides the popover when open becomes false', () => {
      const { popup, hidePopover } = mountPopup({}, { popover: true });

      popup.props = { ...popup.props, open: false }; // re-renders
      expect(hidePopover).toHaveBeenCalledTimes(1);
    });

    it('falls back to inline rendering when the Popover API is absent', () => {
      const { container, popup } = mountPopup(); // no popover support

      expect(popup.hasAttribute('popover')).toBe(false);
      expect(popup.parentNode).toBe(container);
    });
  });
});
