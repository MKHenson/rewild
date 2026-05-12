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
});
