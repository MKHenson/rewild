import { UIInput } from '../UIInput';
import { UISurface, UISurfaceOptions } from '../UISurface';
import { Button } from './Button';
import { Modal } from './Modal';

const MOUSE = { pointerId: 1, pointerType: 'mouse' as const };

function setup(options: { closeOnBackdrop?: boolean } = {}) {
  const surfaces: UISurface[] = [];
  const ui = {
    createSurface(options: UISurfaceOptions) {
      const surface = new UISurface(options);
      surfaces.push(surface);
      return surface;
    },
  };
  const onClose = jest.fn();
  const modal = new Modal(ui, { ...options, onClose });
  const resume = new Button({ label: 'Resume', style: { height: 40 } });
  modal.append(resume);
  const input = new UIInput({ surfaces });
  const update = () => modal.surface.update(400, 400);
  update();
  return { modal, resume, input, onClose, update };
}

describe('Modal', () => {
  it('takes all input only while open', () => {
    const { modal, input } = setup();
    expect(modal.isOpen).toBe(false);
    expect(input.focusScope()).toBeNull();
    expect(input.pointer('down', { ...MOUSE, x: 5, y: 5 })).toBe('passed');

    modal.open();
    expect(modal.isOpen).toBe(true);
    expect(input.focusScope()).toBe(modal.surface);
    modal.close();
    expect(input.focusScope()).toBeNull();
  });

  it('draws nothing while closed, and fades in when it opens', () => {
    const { modal, update } = setup();
    expect(modal.surface.stream.count).toBe(0);
    modal.open();
    update();
    expect(modal.surface.needsPaint).toBe(true);
  });

  it('closes on Escape and calls onClose', () => {
    const { modal, input, onClose } = setup();
    modal.open();
    input.key('down', { key: 'Escape', code: 'Escape' });
    expect(modal.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a click on the backdrop, not on the panel', () => {
    const { modal, input, onClose, update } = setup();
    modal.open();
    update();
    const panel = modal.panel.rect;
    const inside = { x: panel.x + 4, y: panel.y + 4 };
    input.pointer('down', { ...MOUSE, ...inside, button: 0 });
    input.pointer('up', { ...MOUSE, ...inside, button: 0 });
    expect(onClose).not.toHaveBeenCalled();
    input.pointer('down', { ...MOUSE, x: 2, y: 2, button: 0 });
    input.pointer('up', { ...MOUSE, x: 2, y: 2, button: 0 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves the light on the glass to the pointer', () => {
    const { modal, input, update } = setup();
    expect(modal.panel.effectParams).toEqual([0.5, 0, 1, 0]);
    modal.open();
    update();
    // After the fade, so the panel draws.
    modal.surface.update(400, 400, 1, 1000);
    const { x, y, width, height } = modal.panel.rect;
    input.pointer('move', { ...MOUSE, x: x + width / 4, y: y + height / 2 });
    expect(modal.panel.effectParams).toEqual([0.25, 0.5, 1, 0]);
    const primitive = modal.surface.stream.data.subarray(
      modal.panel.primitive * 32 + 28,
      modal.panel.primitive * 32 + 32
    );
    expect(Array.from(primitive)).toEqual([0.25, 0.5, 1, 0]);
  });

  it('can keep a click on the backdrop from closing it', () => {
    const { modal, input, onClose } = setup({ closeOnBackdrop: false });
    modal.open();
    input.pointer('down', { ...MOUSE, x: 2, y: 2, button: 0 });
    input.pointer('up', { ...MOUSE, x: 2, y: 2, button: 0 });
    expect(modal.isOpen).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('drops focus when it closes', () => {
    const { modal, resume, input } = setup();
    modal.open();
    input.key('down', { key: 'ArrowDown', code: 'ArrowDown' });
    expect(resume.node.focused).toBe(true);
    modal.close();
    modal.open();
    expect(modal.surface.focused).toBeNull();
  });
});
