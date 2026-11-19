import { UIInput } from '../UIInput';
import { UINode } from '../UINode';
import { UISurface, UISurfaceOptions } from '../UISurface';
import { Button } from './Button';
import { placePopup, Popup, PopupOptions } from './Popup';

const MOUSE = { pointerId: 1, pointerType: 'mouse' as const, button: 0 };
const WIDTH = 400;
const HEIGHT = 300;
const BOUNDS = { width: WIDTH, height: HEIGHT };

function setup(options: PopupOptions = {}) {
  const surfaces: UISurface[] = [];
  const ui = {
    createSurface(options: UISurfaceOptions) {
      const surface = new UISurface(options);
      surfaces.push(surface);
      return surface;
    },
  };
  const menu = ui.createSurface({ kind: 'screen', name: 'menu', input: 'all' });
  const anchor = (x: number, y: number) => {
    const button = new Button({
      label: 'Open',
      style: {
        position: 'absolute',
        left: x,
        top: y,
        width: 40,
        height: 20,
        minHeight: 0,
      },
    });
    menu.root.append(button);
    return button;
  };
  const onClose = jest.fn();
  const popup = new Popup(ui, { ...options, onClose });
  const items = ['One', 'Two'].map(
    (label) => new Button({ label, style: { width: 100, height: 30 } })
  );
  popup.append(...items);
  const input = new UIInput({ surfaces });
  const update = () => {
    for (const surface of surfaces) surface.update(WIDTH, HEIGHT);
  };
  return { menu, anchor, popup, items, input, onClose, update };
}

const click = (input: UIInput, x: number, y: number) => {
  input.pointer('down', { ...MOUSE, x, y });
  input.pointer('up', { ...MOUSE, x, y });
};

const pad = (pressed: number[]) =>
  ({
    index: 0,
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: pressed.includes(i),
    })),
    axes: [0, 0],
  } as unknown as Gamepad);

describe('placePopup', () => {
  const anchor = { x: 100, y: 100, width: 40, height: 20 };
  const size = { width: 80, height: 50 };

  it('opens under the anchor at its start, with a gap', () => {
    expect(placePopup(anchor, size, BOUNDS)).toEqual({ x: 100, y: 124 });
  });

  it('lines up with the centre or the end of the anchor', () => {
    expect(placePopup(anchor, size, BOUNDS, { align: 'center' }).x).toBe(80);
    expect(placePopup(anchor, size, BOUNDS, { align: 'end' }).x).toBe(60);
  });

  it('opens on each side', () => {
    expect(placePopup(anchor, size, BOUNDS, { placement: 'top' })).toEqual({
      x: 100,
      y: 46,
    });
    expect(placePopup(anchor, size, BOUNDS, { placement: 'right' })).toEqual({
      x: 144,
      y: 100,
    });
    expect(placePopup(anchor, size, BOUNDS, { placement: 'left' })).toEqual({
      x: 16,
      y: 100,
    });
  });

  it('opens on the other side when its side has no room', () => {
    const low = { ...anchor, y: 260 };
    expect(placePopup(low, size, BOUNDS).y).toBe(206);
    const high = { ...anchor, y: 10 };
    expect(placePopup(high, size, BOUNDS, { placement: 'top' }).y).toBe(34);
  });

  it('stays on its side when the other side has less room', () => {
    const tall = { width: 80, height: 200 };
    // It fits on neither side and has more room below, so it stays below
    // and moves up to fit.
    expect(placePopup({ ...anchor, y: 120 }, tall, BOUNDS).y).toBe(92);
  });

  it('moves in from the edges', () => {
    expect(placePopup({ ...anchor, x: 380 }, size, BOUNDS).x).toBe(312);
    expect(
      placePopup({ ...anchor, x: -20 }, size, BOUNDS, { align: 'end' }).x
    ).toBe(8);
  });

  it('keeps the start edge in when it is larger than the bounds', () => {
    const wide = { width: 500, height: 50 };
    expect(placePopup(anchor, wide, BOUNDS).x).toBe(8);
  });
});

describe('Popup', () => {
  it('opens under its anchor and takes all input', () => {
    const { anchor, popup, input, update } = setup();
    const open = anchor(50, 40);
    update();
    expect(popup.isOpen).toBe(false);
    expect(popup.surface.stream.count).toBe(0);
    popup.open(open.node);
    update();
    expect(popup.isOpen).toBe(true);
    expect(input.focusScope()).toBe(popup.surface);
    expect(popup.panel.rect).toMatchObject({ x: 50, y: 64, width: 110 });
  });

  it('stays on screen at the right and bottom edges', () => {
    const { anchor, popup, update } = setup();
    const corner = anchor(WIDTH - 40, HEIGHT - 20);
    update();
    popup.open(corner.node);
    update();
    const { x, y, width, height } = popup.panel.rect;
    expect(width).toBe(110);
    expect(x + width).toBe(WIDTH - 8);
    expect(y + height).toBe(HEIGHT - 20 - 4);
  });

  it('keeps its full width when it grows near the right edge', () => {
    const { anchor, popup, update } = setup();
    const right = anchor(WIDTH - 40, 40);
    update();
    popup.open(right.node);
    update();
    // Content that wraps, as text does, to the room it has.
    popup.append(
      new UINode({
        measure: (limit) => ({ width: Math.min(200, limit), height: 10 }),
      })
    );
    update();
    const { x, width } = popup.panel.rect;
    expect(width).toBe(210);
    expect(x).toBe(WIDTH - 8 - 210);
  });

  it('moves with its anchor when it opens next to another', () => {
    const { anchor, popup, update } = setup();
    const first = anchor(WIDTH - 40, 40);
    const second = anchor(10, 100);
    update();
    popup.open(first.node);
    update();
    popup.open(second.node);
    update();
    expect(popup.panel.rect).toMatchObject({ x: 10, y: 124, width: 110 });
  });

  it('closes on a click outside, not on a click inside', () => {
    const { anchor, popup, input, onClose, update } = setup();
    const open = anchor(50, 40);
    update();
    popup.open(open.node);
    update();
    const { x, y } = popup.panel.rect;
    click(input, x + 2, y + 2);
    expect(popup.isOpen).toBe(true);
    const menuClick = jest.fn();
    open.node.on('click', menuClick);
    click(input, 300, 250);
    expect(popup.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    // The click that closes the popup does not reach the menu under it.
    click(input, 60, 45);
    expect(menuClick).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const { anchor, popup, input, onClose, update } = setup();
    const open = anchor(50, 40);
    update();
    popup.open(open.node);
    input.key('down', { key: 'Escape', code: 'Escape' });
    expect(popup.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on the gamepad's B", () => {
    const { anchor, popup, input, onClose, update } = setup();
    const open = anchor(50, 40);
    update();
    popup.open(open.node);
    input.readGamepads([pad([1])], 0);
    expect(popup.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the popup and back to the anchor', () => {
    const { menu, anchor, popup, items, input, update } = setup();
    const open = anchor(50, 40);
    open.onClick = () => popup.open(open.node);
    update();
    open.node.focus({ focusVisible: true });
    input.key('down', { key: 'Enter', code: 'Enter' });
    update();
    expect(popup.surface.focused).toBe(items[0].node);
    expect(popup.surface.focusVisible).toBe(true);
    input.key('down', { key: 'ArrowDown', code: 'ArrowDown' });
    expect(popup.surface.focused).toBe(items[1].node);
    // Focus stays in the popup.
    input.key('down', { key: 'Tab', code: 'Tab' });
    expect(popup.surface.focused).toBe(items[0].node);
    input.key('down', { key: 'Escape', code: 'Escape' });
    expect(popup.surface.focused).toBeNull();
    expect(menu.focused).toBe(open.node);
    expect(menu.focusVisible).toBe(true);
  });

  it('gives focus to its anchor when nothing had focus', () => {
    const { menu, anchor, popup, update } = setup();
    const open = anchor(50, 40);
    update();
    popup.open(open.node);
    expect(popup.surface.focused).toBe(popup.panel.children[0]);
    expect(popup.surface.focusVisible).toBe(false);
    popup.close();
    expect(menu.focused).toBe(open.node);
    expect(menu.focusVisible).toBe(false);
  });
});
